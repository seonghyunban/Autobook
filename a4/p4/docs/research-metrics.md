# Metrics Research

## 1. Formulation

### Motivation

This research defines what to measure and where, so that the experimental results can answer every comparison required by the assignment. The measurement design must serve these requirements:

- **R5**: Compare combined run (all additional rewards) to original RL run
- **R7**: Compare each separate run (original + one additional reward) to both original RL and combined run
- **R8-R9**: Classify mistakes from original RL and combined RL, compare mistake types between them
- **R11**: Create visualizations illustrating mistake type differences
- **R12**: Summary table of all results

And operate within these constraints (from item 1 findings):

- **Algorithm**: Pure REINFORCE, no KL regularization, no PPO ratio/clip
- **Reward**: Binary correctness (1.0 if answer matches gold, 0.0 otherwise), returned as float
- **Advantage**: `rewards - rewards.mean()` (no z-score normalization)
- **Training**: 1 epoch, 16 examples/step, 16 samples/example, 467 steps, max 256 tokens
- **Eval/save**: Every 60 steps during training
- **Test set**: 1319 GSM8k test problems
- **Starting accuracy**: 15.39% strict GSM8k (P2 SFT checkpoint)

### Research Questions

**RQ1: What metrics do RL-for-math papers use to compare reward configurations?**

*Grounding*: R5 and R7 require comparing runs. We need to know what the field considers standard comparison metrics for math RL beyond raw accuracy. This determines what goes in the summary table (R12).

*Sub-questions*:
- What accuracy variants exist (strict match, relaxed match, parseable rate)?
- Do papers report per-problem gain/loss deltas or only aggregate scores?
- What training-time diagnostics are standard (reward curves, gradient norms, entropy)?

**RQ2: What observation points exist — training-time diagnostics vs post-training evaluation?**

*Grounding*: Item 1 shows nanochat has two natural observation points: (a) per-step metrics during training (logged every 60 steps to W&B), and (b) post-training evaluation on the full test set. We need to decide what to measure at each.

*Sub-questions*:
- What training-time signals are informative for detecting reward impact (mean reward, per-component reward, loss, sequence length)?
- What post-training evaluation metrics go beyond accuracy (error categorization, consistency across samples)?
- Is there value in mid-training evaluation checkpoints, or is final-only sufficient?

**RQ3: What metrics separate "model learned the skill" from "model is consistent"?**

*Grounding*: D10 already proposes Pass@1 (headline accuracy) and Pass@8 (knowledge vs consistency). We need to validate this choice and understand whether other approaches exist. A model that gets 30% Pass@1 but 50% Pass@8 knows more than it reliably produces — this distinction matters for interpreting reward impact.

*Sub-questions*:
- How is Pass@k used in math reasoning evaluation? What values of k are standard?
- Are there alternatives to Pass@k for measuring consistency (majority voting, self-consistency)?
- What does the gap between Pass@1 and Pass@k tell us about the model?

**RQ4: What metrics capture error distribution shifts across runs?**

*Grounding*: R8-R9 require classifying and comparing mistakes. R11 requires visualizing mistake differences. D9 defines a rule-based taxonomy. We need metrics that quantify how the mistake distribution changes when rewards change.

*Sub-questions*:
- How do papers measure shifts in error type distributions?
- What visualization approaches show error category changes across experimental conditions?
- Is per-problem tracking (which specific problems flip between correct/incorrect) standard?

### Search Strategy

**Sources to consult**:
1. Papers on RLHF/RLVR for math reasoning (GSM8k, MATH, competition math)
2. Papers on reward shaping for language models
3. Nanochat/Karpathy baseline documentation and existing eval code
4. Standard RL evaluation methodology papers

**Search terms**:
- "GSM8k reward function evaluation metrics"
- "RLHF math reasoning comparison metrics"
- "Pass@k math evaluation"
- "error analysis reward shaping language model"
- "REINFORCE reward comparison ablation study metrics"
- "mistake classification distribution shift NLP"
