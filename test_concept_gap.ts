import { analyzeConceptGap } from './services/textUtils';

// Mock cleanAndStem since it's used internally
// We'll just rely on the implementation in textUtils being correct as we can't easily mock internal calls
// but we can test the function end-to-end

const inputs = [
    {
        text: "The app crashes frequently and has poor connectivity.",
        summary: "Users reported technical issues like crashing apps and connection problems."
    },
    {
        text: "We need more focus on indigenous knowledge.",
        summary: "The project focuses on local wisdom."
    }
];

console.log("Testing analyzeConceptGap...");

inputs.forEach(({ text, summary }, idx) => {
    console.log(`\nCase ${idx + 1}:`);
    console.log(`Input: "${text}"`);
    console.log(`Summary: "${summary}"`);

    const result = analyzeConceptGap(text, summary);
    console.log("Kept:", result.kept);
    console.log("Dropped:", result.dropped);

    const score = result.kept.length / (result.kept.length + result.dropped.length);
    console.log(`Retention Rate: ${(score * 100).toFixed(1)}%`);
});
