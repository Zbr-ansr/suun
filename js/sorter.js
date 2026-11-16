import { MIN_SCORE, MIN_MARGIN, MAX_REFS_PER_NODE } from './config.js';
import { getNodes, getAllItems, updateNode, updateItem } from './db.js';
import { embed } from './embedder.js';

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
