# Co-Creation Provenance Lab: Methodology

The Co-Creation Provenance Lab is designed to audit participatory datasets (e.g., citizen feedback, stakeholder consultations) and the resulting executive summaries. It provides a mathematical and semantic accounting of whose voices are represented, whose are ignored, and whether the synthesis process introduced structural biases.

This document details the underlying scientific, statistical, and natural language processing (NLP) methodologies powering the tool.

---

## 1. Semantic Representation (Embeddings)

The foundation of the transparency audit is transforming text (both individual participant inputs and the final synthesis/summary) into high-dimensional vector representations. 

The system employs a **3-Tier Fallback Hierarchy** to ensure robust performance across different environments (from cloud APIs to purely local, offline browser execution):

1. **Tier 1 (AI APIs):** Uses advanced Large Language Models (LLMs) via external providers like OpenAI, Gemini, or local models via Ollama to generate state-of-the-art semantic embeddings.
2. **Tier 2 (In-Browser Transformers):** If no API is configured, the tool falls back to running HuggingFace's `Xenova/bge-m3` directly in the browser via WebAssembly, ensuring offline capabilities without sacrificing semantic understanding.
3. **Tier 3 (Scientific NLP Fallback):** For massive datasets or legacy browser constraints, it falls back to a fast, client-side TF-IDF (Term Frequency-Inverse Document Frequency) vectorization algorithm.

## 2. Representation Scoring (Cosine Similarity)

To determine how well a participant's input is reflected in the final summary, the system calculates the **Representation Score**.

This is calculated using the **Cosine Similarity** between the participant's embedding vector ($P$) and the summary's embedding vector ($S$):

$$ \text{Cosine Similarity} (P, S) = \frac{P \cdot S}{||P|| \times ||S||} $$

The raw cosine similarity is mapped to a percentage (0–100%). A high score indicates the semantic essence of the participant's input is strongly present in the summary; a low score indicates their input was largely discarded.

## 3. Equity Analytics (The Gini Coefficient)

While average representation gives a general view of summary fidelity, it hides structural inequalities. For instance, an average representation of 50% could mean *everyone* is somewhat represented, or it could mean *half* the participants are perfectly represented while the other half are completely ignored.

To quantify this inequality, the system uses the **Gini Coefficient**, a statistical measure originally developed for economics to measure wealth distribution.

In this context, the dataset is ordered by representation score from lowest to highest. The system calculates the area between the ideal line of perfect equality (Lorenz curve where $x=y$) and the actual cumulative representation curve:

$$ G = \frac{\sum_{i=1}^n \sum_{j=1}^n |x_i - x_j|}{2n^2 \mu} $$

*   **$G = 0.0$:** Perfect equality (everyone is equally represented).
*   **$G \to 1.0$:** Absolute inequality (one person dominates the entire summary).

A high Gini index indicates "Majority Rule" or systemic bias, where minority or divergent views have been systematically excluded.

## 4. Uncertainty Estimation (Bootstrap Confidence Intervals)

Because participatory datasets are often subsets of a larger population, point estimates (like a Gini coefficient of $0.42$) carry uncertainty.

To provide statistical rigor, the system uses **Bootstrapping**—a resampling technique where the algorithm randomly samples participants from the dataset (with replacement) to create 1,000 synthetic datasets. 

It recalculates the Average Representation and the Gini Coefficient for all 1,000 sets to generate a **95% Confidence Interval**. This proves to users that the observed inequalities are statistically significant, rather than artifacts of a small sample size.

## 5. Keyword Extraction (RAKE & AI Keyphrases)

To extract the substantive topics driving the conversation, the tool avoids naive word frequency counting (which produces meaningless tokens like "people" or "more"). 

1. **Primary (LLM):** If an AI provider is connected, the tool uses an advanced prompt to extract complex, actionable, multi-word concept phrases (e.g., "regulatory compliance", "public transit infrastructure").
2. **Fallback (RAKE):** The algorithmic fallback uses **RAKE (Rapid Automatic Keyword Extraction)**. RAKE splits sentences at stop-word and punctuation boundaries to isolate "candidate phrases." It then scores each phrase by calculating the degree of word co-occurrence divided by word frequency. This purely mathematical approach successfully extracts domain-specific multi-word phrases without requiring a massive pre-trained corpus.

## 6. Blind Spot Detection (Semantic Isolation)

A participant with a low representation score might just be repeating a point that didn't make the cut. However, a participant with a low score who *also* introduced entirely unique concepts represents a critical **Blind Spot**.

1. **Global Centroid:** The system calculates the "average" embedding vector of the entire conversation.
2. **Semantic Isolation:** For each participant, their Euclidean distance from the global centroid is measured. High distance = highly unique perspective.
3. **Blind Spot Flagging:** Participants who fall in the top quartile of Semantic Isolation *and* the bottom quartile of Representation are flagged as "At-Risk" or "Lost Voices."

## 7. Concept Fidelity (What Was Kept vs. Dropped)

The system performs a structural gap analysis using the keywords generated for each participant.
By fuzzy-matching the stemmed participant keywords against the stemmed vocabulary of the final summary, the tool categorizes each participant's concepts into:
*   **Kept:** Concepts successfully integrated into the summary.
*   **Dropped:** Concepts that the participant raised but which failed to appear in the final text. 

The aggregate list of "Dropped Concepts" provides a roadmap for the "Revision" phase.

## 8. Traceability & Lineage Mapping

For ultimate provenance, the tool maps the specific lineage of every outcome.

1. **Sentence Splitting:** The final summary is split into sentences using a robust multilingual regex parser.
2. **Sentence-Level Matching:** The system calculates the cosine similarity between each participant's embedding and the embedding of *each specific sentence* in the summary.
3. **Lineage Edges:** The system creates a bipartite graph where edges connect participants to the specific summary sentences they most heavily influenced. 

## 9. Contextual AI Actions (Facilitation Co-Pilot)

Using the mathematical insights (e.g., recognizing that Participant 12 is highly isolated and dropped), the system generates dynamic, non-confrontational facilitation prompts.

Example: *"One participant raised the perspective: 'Local business micro-grants'. How could the current consensus be adapted to include this point of view?"*

This bridges the gap between cold mathematical auditing and human-centric workshop facilitation.
