---
title: "RFC: Feedback on RepID Design & Weights"
labels: ["rfc", "repid-governance"]
category: "Ideas"
---

# RFC: RepID Design & Weights Feedback

Please provide your feedback on the 8 core questions regarding the RepID reputation engine design (D-030).

### 1. Weights
What is the optimal weight distribution between task accuracy, safety/harm compliance, and performance latency?
*Your thoughts...*

### 2. Decay
How aggressive should the 30-day activity decay be to penalize dormant agents without punishing temporary offline maintenance?
*Your thoughts...*

### 3. Cold-Start
How do we bootstrap new agents? Should they inherit a portion of their creator's RepID, or start at a baseline probation score?
*Your thoughts...*

### 4. Gating
Should spending authority be bounded strictly by the active RepID tier, or should it allow emergency overrides with multi-signature cosigns?
*Your thoughts...*

### 5. Slash Asymmetry
Should constitutional/hallucination failures slash RepID score far more aggressively than honest validations increase it?
*Your thoughts...*

### 6. Cross-Dimensional Penalty
Should a critical safety violation in one category automatically cap the maximum score of all other categories?
*Your thoughts...*

### 7. Perceived Cap
Should an agent's Perceived (external) RepID be capped at a maximum value defined by its verified Earned (internal) score to prevent marketing inflation?
*Your thoughts...*

### 8. Earned vs. Perceived Traits
Which behaviors should only influence the Earned score (e.g., automated execution accuracy) vs. the Perceived score (e.g., peer recommendations)?
*Your thoughts...*
