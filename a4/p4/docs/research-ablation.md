# Ablation Research

## 1. Formulation

### Motivation

This research defines how to structure experiments so that every required comparison is clearly stated, variables are identified, and we know what constitutes a meaningful result. The ablation design must serve these requirements:

- **R4**: Use same configuration as original RL script (controlled variable)
- **R5**: Compare combined run to original RL run
- **R6**: Run separate: original correctness + each additional reward in its own training run
- **R7**: Compare separate runs to original RL and to combined run
- **R13**: Commentary on the impact of each change

Using these inputs:

**D3 — Run Configuration** (6 runs):

| Run | Rewards Used |
|-----|-------------|
| Baseline | Original only |
| Separate A | Original + Format Compliance |
| Separate B | Original + Numeric Proximity |
| Separate C | Original + C (post-P3) |
| Separate D | Original + D (post-P3) |
| Combined | Original + A + B + C + D |

**Dependent variables** (from design-metrics.md):
- Training-time: mean reward, per-component mean reward, mean sequence length
- Post-training: Pass@1, Pass@8, extraction failure rate, per-category error counts, per-category error percentages, net problem delta
- Derived: Pass@8-Pass@1 gap, error distribution delta

**Constraints**:
- Pure REINFORCE, no KL, binary reward baseline
- 1 epoch, 467 steps, 16 samples/example, 256 max tokens
- Same checkpoint, same hyperparameters across all runs (R4)
- Single run per configuration (no repeated runs for variance estimation)

### Research Questions

**RQ1: How to structure pairwise and ablative comparisons across the D3 run table?**

*Grounding*: D3 defines 6 runs. R5 requires Combined vs Baseline. R6 requires each Separate run. R7 requires Separate vs Baseline AND Separate vs Combined. We need a systematic comparison structure that covers all these requirements without redundancy.

*Sub-questions*:
- What is the standard comparison structure in reward ablation papers? (pairwise, leave-one-out, factorial?)
- How do papers with combined reward runs decompose the combined effect into individual contributions?
- Is there a standard way to present ablation results (comparison tables, ablation matrices)?

**RQ2: What counts as a significant difference in small-scale RL with ~1,300 test problems?**

*Grounding*: R13 requires "commentary on the impact of each change." We need to distinguish signal from noise. With 1319 test problems and ~15-20% accuracy (~200-260 correct), small absolute differences could be noise.

*Sub-questions*:
- What effect sizes do small-scale RL papers report on GSM8k?
- How do papers handle significance when they have a single run per configuration (no confidence intervals from repeated runs)?
- Is per-problem overlap analysis (gained/lost) a more robust signal than aggregate accuracy difference?
- What magnitude of error category shift is considered meaningful?

**RQ3: How to decompose combined-run effects into individual reward contributions?**

*Grounding*: R5 compares Combined to Baseline. R7 compares each Separate to Combined. R13 asks for per-change impact. The Combined run includes all 4 additional rewards — we need to attribute its behavior to individual components.

*Sub-questions*:
- Can per-component reward curves (from W&B) show which rewards are active vs inactive in the combined run?
- Does comparing Combined to each Separate run reveal synergy (Combined > sum of Separate improvements) or interference (Combined < worst Separate)?
- What frameworks exist for attributing combined RL effects to individual reward components?

### Search Strategy

**Sources to consult**:
1. Papers on multi-reward RL training and reward composition
2. Papers on ablation study methodology in NLP/ML
3. GSM8k and math reasoning papers with multiple reward configurations
4. Statistical methodology for single-run comparisons

**Search terms**:
- "ablation study reward function reinforcement learning LLM"
- "multi-reward RL decomposition synergy interference"
- "GSM8k reward comparison significance effect size"
- "single run comparison methodology machine learning"
- "reward composition RLHF ablation"
