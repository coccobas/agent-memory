# LLM Benchmark Learnings

## 2026-01-27 Quick Benchmark Results

### Models Tested (Quick Mode - 13 test cases)

| Model                               | Success Rate | Avg Latency | Notes                                |
| ----------------------------------- | ------------ | ----------- | ------------------------------------ |
| gpt-oss-120b                        | 100%         | 12,340ms    | Baseline - perfect accuracy but slow |
| openai/gpt-oss-20b                  | 92%          | 3,581ms     | Best balance of speed and accuracy   |
| zai-org/glm-4.7-flash               | 85%          | 17,769ms    | Good accuracy, moderate speed        |
| mistralai/ministral-3-14b-reasoning | 85%          | 36,341ms    | Slow, reasoning overhead             |
| qwen/qwen3-1.7b                     | 23%          | 3,852ms     | Fast but outputs `<think>` tags      |
| qwen3-32b                           | 23%          | 26,840ms    | Outputs `<think>` tags, slow         |

### Key Findings

1. **Qwen models output `<think>` tags** - They wrap responses in `<think>...</think>` XML tags which breaks JSON parsing. Would need prompt engineering or post-processing to handle.

2. **GPT-OSS 20B is the sweet spot** - 92% accuracy with 3.5s avg latency vs 120B's 12.3s. Only fails on complex multi-type extraction.

3. **GLM-4 Flash is viable** - 85% accuracy, good for classification (100%) and query rewrite (100%).

4. **Ministral reasoning model is slow** - The reasoning overhead adds significant latency without improving accuracy.

### Category Performance

| Category       | Best Model                | Success Rate |
| -------------- | ------------------------- | ------------ |
| Extraction     | gpt-oss-120b              | 100%         |
| Classification | gpt-oss-120b, gpt-oss-20b | 100%         |
| Query Rewrite  | All non-Qwen models       | 100%         |
| Cross-Encoder  | gpt-oss-120b, gpt-oss-20b | 100%         |

### Recommendations

1. **For production**: Use `gpt-oss-120b` if accuracy is critical, `openai/gpt-oss-20b` for better latency
2. **For development/testing**: `openai/gpt-oss-20b` offers best speed/accuracy tradeoff
3. **Avoid Qwen models** for JSON-output tasks without additional prompt engineering
