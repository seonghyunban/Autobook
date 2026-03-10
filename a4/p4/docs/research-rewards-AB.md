# Research: Rewards A/B

## 1. Formulation

### Requirements Driving This Research

- **R1**: Design at least 2 additional reward functions beyond binary correctness
- **R14**: Each reward must have literature justification
- **R2**: Motivate rewards from P3 error analysis patterns — A/B are pre-P3 guesses from literature and baseline inspection; C/D will satisfy R2 fully after P3 delivers

### System Constraints

These constrain what reward designs are feasible:

| Constraint | Value | Implication |
|-----------|-------|-------------|
| RL algorithm | REINFORCE (no KL, no PPO ratio+clip) | No reference model available; rewards must be self-contained |
| Advantage computation | `rewards - rewards.mean()` (no z-score) | Reward scale matters — large-magnitude rewards will dominate advantage signal |
| Reward interface | `GSM8K.reward(conversation, assistant_response) -> float` | Reward receives the full conversation (with gold answer) and the model's text response; returns a single float |
| Reward call site | `chat_rl.py:131` — called per sample after decoding | Reward sees final decoded text, not intermediate tokens |
| Samples per example | 16 | Mean subtraction across 16 samples; at least some must differ in reward for non-zero gradients |
| Max generation tokens | 256 | Model has limited space for reasoning; reward shouldn't require very long outputs |
| Composition | Additional rewards must compose with binary correctness | Combined run uses Original + A + B + C + D; rewards are summed before advantage computation |
| Training set | GSM8K train (7,473 problems), 1 epoch, 467 steps | Relatively short training horizon — reward signal must be learnable quickly |
| Gold answer format | `#### <number>` extracted via regex | Model must learn this format to get any correctness reward |
| Calculator tool use | `<<expr=result>>` tags in gold solutions | Model can use calculator; engine masks tool tokens from loss |

### Research Questions

**RQ1: What reward functions beyond binary correctness have been used for math reasoning RL?**
- Scope: GSM8K specifically, and grade-school math reasoning more broadly
- What we need: concrete reward formulations (not just categories), with reported effects
- Relevance: directly answers R1 (what to design) and R14 (literature backing)

**RQ2: What are the known weaknesses of binary correctness reward in REINFORCE for math?**
- Scope: sparse reward problems, reward hacking, format vs reasoning, exploration collapse
- What we need: specific failure modes that additional rewards could address
- Relevance: justifies why additional rewards are needed and what they should target

**RQ3: What format/process/outcome reward categories exist, and which are feasible given our constraints?**
- Format rewards: reward structural properties of the response (presence of `####`, step markers, calculator use)
- Process rewards: reward intermediate reasoning steps (requires a verifier model or heuristic)
- Outcome rewards: reward properties of the final answer beyond binary match (partial credit, proximity)
- Feasibility filter: must work with our interface (text in, float out), no external model, composable with binary reward
- Relevance: narrows the design space to implementable candidates

**RQ4: Which reward approaches are most likely to produce observable effects in our short training horizon (467 steps)?**
- Some rewards may be theoretically sound but require thousands of steps to show effects
- We need rewards that give gradient signal from step 1 (not just once the model is already good)
- Relevance: practical constraint — if a reward doesn't move metrics in 467 steps, it's useless for our experiment

### Search Strategy

**Search terms**:
- `GSM8K reward function RL`
- `math reasoning reward shaping REINFORCE`
- `process reward model GSM8K`
- `format reward RL language model`
- `GRPO reward design`
- `sparse reward reinforcement learning language model`
- `reward shaping grade school math`

**Sources to consult**:
1. DeepSeek-Math (Shao et al., 2024) — GRPO with outcome rewards on math
2. Math-Shepherd (Wang et al., 2024) — process reward models for math
3. Let's Verify Step by Step (Lightman et al., 2023) — process vs outcome reward
4. DAPO (Yu et al., 2025) — reward normalization and advantage computation
5. Karpathy's nanochat discussions/1 — the original RL implementation and known behaviors
6. Wei et al. (2022) Chain-of-Thought — GSM8K error taxonomy (semantic misunderstanding, calculation error, step-missing)
7. Any papers citing GSM8K + reward shaping or auxiliary rewards

**Baseline behavior to inspect** (from `gsm8k.py` and `chat_rl.py`):
- What fraction of 16 samples per example get reward 1.0 vs 0.0? (determines advantage variance)
- How often does the model produce parseable `#### <number>` format but with wrong answer?
- How often does the model fail to produce `####` at all? (format failure vs reasoning failure)
- Does the model use calculator `<< >>` tags? How often?
- What is typical sequence length? (is 256 often hit = truncation?)

These questions will be answered during research execution (step 1.11) by inspecting Karpathy's reported baseline behavior and our P2 eval results.
