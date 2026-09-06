/**
 * routing.js — Unassigned intake & triage routing engine (Stitch v6 / §3.7.3).
 * Bridges raw dump/extension intake into structured subject and assignment bindings.
 */

export const TRIAGE_DECISIONS = {
  NEW: 'new',
  APPEND: 'append',
  DISCARD: 'discard',
};

export const TRIAGE_LABELS = {
  new: 'New Assignment',
  append: 'Append to Existing',
  discard: 'Discard',
};

/**
 * Calculates estimated token synthesis cost for an unassigned dump item.
 */
export function estimateTriageTokens(item) {
  const sizeBytes = Number(item?.size || 10240);
  const wordsEstimate = Math.max(50, Math.round(sizeBytes / 20));
  // Baseline 1 token per 2 words for synthesis + 200 base overhead
  const tokenCost = Math.round(wordsEstimate * 0.6) + 200;
  const costUsd = (tokenCost * 0.00001).toFixed(4);
  return { tokenCost, costUsd };
}

/**
 * Derives a matched keyword list and confidence rating for an intake file.
 */
export function analyzeIntakeConfidence(filename = '', content = '') {
  const text = (filename + ' ' + content).toLowerCase();
  const keywords = [];

  if (text.includes('chiral') || text.includes('reaction') || text.includes('chem') || text.includes('bio')) {
    keywords.push('chiral', 'organocatalysis', 'proline');
    return { subjectCode: 'BIO-309', subjectName: 'Organic Chemistry', confidence: 98, keywords };
  }
  if (text.includes('raft') || text.includes('consensus') || text.includes('distributed') || text.includes('cs')) {
    keywords.push('invariant', 'state-machine', 'quorum');
    return { subjectCode: 'CS-441', subjectName: 'Distributed Systems', confidence: 95, keywords };
  }
  if (text.includes('manifold') || text.includes('topology') || text.includes('math')) {
    keywords.push('homeomorphism', 'compactness', 'metric');
    return { subjectCode: 'MATH-202', subjectName: 'Topology', confidence: 92, keywords };
  }
  if (text.includes('mechanics') || text.includes('lagrangian') || text.includes('phys')) {
    keywords.push('euler-lagrange', 'hamiltonian', 'vectors');
    return { subjectCode: 'PHY-201', subjectName: 'Classical Mechanics', confidence: 91, keywords };
  }

  return {
    subjectCode: 'GEN-101',
    subjectName: 'General Coursework',
    confidence: 84,
    keywords: ['coursework', 'notes', 'syllabus'],
  };
}
