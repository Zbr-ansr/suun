import { MIN_SCORE, MIN_MARGIN, MAX_REFS_PER_NODE } from './config.js';
import { getNodes, getAllItems, updateNode, updateItem } from './db.js';
import { embed } from './embedder.js';
import { softSplits } from './splitter.js';

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function rankNodes(vec, nodes, confirmedItems) {
  const ranked = nodes.map((node) => {
    const refs = [];
    if (node.anchorVec) refs.push(node.anchorVec);
    if (node.exampleVecs) refs.push(...node.exampleVecs);
    confirmedItems
      .filter((it) => it.nodeId === node.id && it.confirmed === true && it.vec)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_REFS_PER_NODE)
      .forEach((it) => refs.push(it.vec));
    let score = -Infinity;
    for (const r of refs) score = Math.max(score, cosine(vec, r));
    return { nodeId: node.id, score };
  });
  return ranked.sort((a, b) => b.score - a.score);
}

export function decide(ranked) {
  if (ranked.length === 0) return { status: 'unsure', candidates: [] };
  const top = ranked[0];
  if (ranked.length === 1) {
    return top.score >= MIN_SCORE
      ? { status: 'confident', nodeId: top.nodeId }
      : { status: 'unsure', candidates: [top.nodeId] };
  }
  const second = ranked[1];
  if (top.score >= MIN_SCORE && top.score - second.score >= MIN_MARGIN) {
    return { status: 'confident', nodeId: top.nodeId };
  }
  return { status: 'unsure', candidates: [top.nodeId, second.nodeId] };
}

export async function ensureVectors() {
  const [nodes, items] = await Promise.all([getNodes(), getAllItems()]);
  const needNodes = nodes.filter((n) => !n.anchorVec);
  const needItems = items.filter((i) => i.confirmed === true && !i.vec);
  const needEx = nodes.filter((n) => Array.isArray(n.examples) && n.examples.length && !n.exampleVecs);
  const texts = [...needNodes.map((n) => `${n.name}: ${n.description}`), ...needItems.map((i) => i.text),
    ...needEx.flatMap((n) => n.examples)];
  if (!texts.length) return;
  const vecs = await embed(texts);
  let k = 0;
  for (const n of needNodes) await updateNode(n.id, { anchorVec: vecs[k++] });
  for (const i of needItems) await updateItem(i.id, { vec: vecs[k++] });
  for (const n of needEx) {
    const ev = vecs.slice(k, k + n.examples.length);
    k += n.examples.length;
    await updateNode(n.id, { exampleVecs: ev });
  }
}

export async function classify(pieces) {
  if (!pieces.length) return [];
  await ensureVectors();
  const vecs = await embed(pieces);
  const [nodes, items] = await Promise.all([getNodes(), getAllItems()]);
  const confirmed = items.filter((i) => i.confirmed === true);
  return pieces.map((text, i) => {
    const d = decide(rankNodes(vecs[i], nodes, confirmed));
    return {
      text,
      vec: vecs[i],
      status: d.status,
      nodeId: d.status === 'confident' ? d.nodeId : null,
      candidates: d.status === 'confident' ? [] : d.candidates
    };
  });
}

// Like classify(), but a piece that holds two thoughts for different nodes is cut in two first.
// A cut is kept only when each side fits its own node better than the whole piece fits any node.
export async function classifySplit(pieces) {
  if (!pieces.length) return [];
  await ensureVectors();
  const [nodes, items] = await Promise.all([getNodes(), getAllItems()]);
  const confirmed = items.filter((i) => i.confirmed === true);
  const judge = async (text) => {
    const [vec] = await embed([text]);
    const ranked = rankNodes(vec, nodes, confirmed);
    const d = decide(ranked);
    return {
      text,
      vec,
      status: d.status,
      nodeId: d.status === 'confident' ? d.nodeId : null,
      candidates: d.status === 'confident' ? [] : d.candidates,
      topId: ranked.length ? ranked[0].nodeId : null,
      score: ranked.length ? ranked[0].score : -Infinity
    };
  };
  // A side is acceptable if it is confident, or if it can itself be cut again (three thoughts in one breath).
  const usable = (x) => x.status === 'confident' || softSplits(x.text).length > 0;
  const out = [];
  const walk = async (whole, depth) => {
    let best = null;
    if (depth < 4) {
      for (const [L, R] of softSplits(whole.text)) {
        const l = await judge(L);
        const r = await judge(R);
        if (l.topId === r.topId) continue;
        // Both sides must be clear on their own, or be cut again (three thoughts in one breath).
        if (!usable(l) || !usable(r)) continue;
        // `dom` is the side that goes where the whole piece would have gone. Removing an unrelated
        // thought should make it fit that node at least as well as before; if it fits worse, the
        // two sides were one thought.
        const dom = l.topId === whole.topId ? l : r.topId === whole.topId ? r : null;
        if (dom && dom.score < whole.score) continue;
        const gain = l.score + r.score;
        if (!best || gain > best.gain) best = { l, r, gain };
      }
    }
    if (!best) { out.push(whole); return; }
    await walk(best.l, depth + 1);
    await walk(best.r, depth + 1);
  };
  for (const p of pieces) await walk(await judge(p), 0);
  return out;
}
