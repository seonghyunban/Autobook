# Context Window Extension: Literature Review

## Why Train-Short-Then-Extend Works

Training a language model at reduced sequence length before extending to the target length is a well-studied approach with two primary advantages:

1. **Computational savings**: Self-attention cost is quadratic in sequence length. Training at 512 tokens is ~16x cheaper per step than training at 2048 tokens, allowing the model to see more tokens in the same wall-clock time.

2. **Curriculum effect**: Starting with short contexts forces the model to learn local patterns (syntax, common phrases, short-range dependencies) before tackling long-range dependencies. GrowLength (Jin et al., 2023) demonstrates that this curriculum produces lower loss than fixed-length training at the same compute budget — a 70M model trained with progressive growth matched the loss of a 160M model trained at fixed length.

SkyLadder (NeurIPS 2025) further confirms that models pretrained with shorter contexts consistently outperform long-context models on standard benchmarks, while still acquiring long-context capability once exposed to longer sequences.

## Known Pitfalls

### Loss Spike on Context Change

When sequence length increases abruptly, models experience a transient loss spike. GrowLength observes that "substantial difference between consecutive training window sizes can lead to dramatic loss rising." The spike occurs because:

- The model encounters positional patterns it hasn't seen (positions 512–2048)
- Attention patterns must adapt to a 4x larger context window
- Batch statistics shift (more tokens per sequence, different padding ratios)

The spike is recoverable — loss drops back within a few hundred steps as the model adapts. SkyLadder finds that monotonic short-to-long expansion avoids the worst spikes; cyclic schedules (long→short→long) cause more severe disruption.

### Forgetting

If extension training runs too long relative to the short-context phase, the model may degrade on capabilities learned during short-context training. ProLong (Gao et al., 2024) emphasizes mixing short-context data with long-context data during extension to preserve short-context performance. In our setting, nanochat's dataloader draws from the same dataset at both lengths, which naturally provides this mix.

## Standard Ratios

| Paper | Short Length | Target Length | Ratio | Notes |
|-------|-------------|---------------|-------|-------|
| GrowLength | 128 | 1024 | 8x | Multi-stage: 128→256→512→1024 |
| SkyLadder | 32 | 8192 | 256x | Linearly increasing schedule (stepwise in 1K increments) |
| ProLong | 8192 | 512K | 64x | Continued pretraining from Llama-3-8B |
| **Ours** | **512** | **2048** | **4x** | Single-stage jump |

Our 4x ratio is conservative compared to the literature. GrowLength successfully uses 2x between stages; SkyLadder handles 256x with continuous expansion. A 4x single-stage jump is within the safe range, especially with RoPE (which handles new positions without weight mismatch).

## Sequence Length Choice: 512

We choose `max_seq_len=512` for stage 1 based on:

1. **Assignment guidance**: The assignment explicitly suggests 512 as the reduced sequence length.
2. **4x ratio is well-studied**: Falls within the moderate range of ratios shown to work in GrowLength and SkyLadder.
3. **RoPE compatibility**: Nanochat uses RoPE with `persistent=False` buffers — no positional embedding weights are saved to the checkpoint. Changing `--max-seq-len` on resume simply recomputes the RoPE cache at the new length. No interpolation or rescaling is needed because 2048 is nanochat's default (not an extrapolation beyond training range).
4. **Inference-time behavior**: RoPE frequencies are pre-computed at 10x the training sequence length (verified in Phase 2, `gpt.py`). After stage 1 (512), the model can already process up to 5120 tokens at inference. After stage 2 (2048), this extends to 20480.
5. **Eval-friendly**: The 4x gap between 512 and 2048 creates a clear signal for the custom eval — the model should visibly struggle with positions 512–2048 before extension and handle them after.

## References

1. Jin, H., Han, X., Yang, J., Jiang, Z., Chang, C.-Y., & Hu, X. (2023). *GrowLength: Accelerating LLMs Pretraining by Progressively Growing Training Length*. arXiv:2310.00576. https://arxiv.org/abs/2310.00576

2. Zhu, T., Liu, Q., Wang, H., Chen, S., Gu, X., Pang, T., & Kan, M.-Y. (2025). *SkyLadder: Better and Faster Pretraining via Context Window Scheduling*. NeurIPS 2025. arXiv:2503.15450. https://arxiv.org/abs/2503.15450

3. Gao, T., Wettig, A., Yen, H., & Chen, D. (2024). *How to Train Long-Context Language Models (Effectively)*. ACL 2025. arXiv:2410.02660. https://arxiv.org/abs/2410.02660
