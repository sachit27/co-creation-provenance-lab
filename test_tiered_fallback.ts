/**
 * Test script for verifying the 3-tier analysis fallback system
 * Run with: npx ts-node --esm test_tiered_fallback.ts
 */

import {
    analyzeSentimentAI,
    extractKeywordsAI,
    analyzeConceptGapAI,
    classifyEntailmentAI,
    semanticSimilarityAI
} from './services/aiAnalysis';
import { AnalysisConfig } from './types';

// Mock config that will cause AI to fail (no actual API connection)
const offlineConfig: AnalysisConfig = {
    aiProvider: 'gemini',
    model: 'gemini-2.0-flash',
    embeddingModel: 'text-embedding-004',
    summaryMethod: 'ai',
    strategy: 'balanced',
    runLOO: false,
    runContributionLineage: false,
    runBlindSpotAnalysis: false
};

async function testSentiment() {
    console.log('\n=== SENTIMENT ANALYSIS TEST ===');

    const testCases = [
        "I love this project, it's amazing!",
        "This is terrible and broken.",
        "The data is objective and factual.",
        "The project focuses too much on data quantity rather than quality", // The bug case
        "This is not good at all" // Negation test
    ];

    for (const text of testCases) {
        try {
            const result = await analyzeSentimentAI(text, offlineConfig);
            console.log(`"${text.slice(0, 50)}..." → ${result.label} (score: ${result.score.toFixed(2)})`);
        } catch (e) {
            console.error(`FAILED: "${text.slice(0, 30)}..."`, e);
        }
    }
}

async function testKeywords() {
    console.log('\n=== KEYWORD EXTRACTION TEST ===');

    const text = "The mobile app crashes frequently, especially when users try to upload images. We need better connectivity support for rural areas.";

    try {
        const keywords = await extractKeywordsAI(text, offlineConfig, 10);
        console.log('Keywords:', keywords);
    } catch (e) {
        console.error('FAILED:', e);
    }
}

async function testConceptGap() {
    console.log('\n=== CONCEPT GAP ANALYSIS TEST ===');

    const input = "The app crashes frequently and needs better offline support for rural communities.";
    const summary = "Technical barriers and connectivity issues were identified as key concerns for underserved populations.";

    try {
        const result = await analyzeConceptGapAI(input, summary, offlineConfig);
        console.log('Kept concepts:', result.kept);
        console.log('Dropped concepts:', result.dropped);
    } catch (e) {
        console.error('FAILED:', e);
    }
}

async function testStemming() {
    console.log('\n=== STEMMING VERIFICATION ===');

    // Import the cleanAndStem-related functions from textUtils
    const { extractKeywords } = await import('./services/textUtils');

    const testCases = [
        "The project focuses on data quantities",
        "Countries are processing requests",
        "The app crashes frequently"
    ];

    for (const text of testCases) {
        const keywords = extractKeywords(text, 10);
        console.log(`"${text}" → [${keywords.join(', ')}]`);
    }
}

async function testContradiction() {
    console.log('\n=== CONTRADICTION DETECTION TEST ===');

    const { quickContradictionCheck } = await import('./services/nli');

    const testCases = [
        { input: "We need more trees", summary: "Trees are not a priority" },
        { input: "I support this initiative", summary: "The initiative was opposed" },
        { input: "The data is accurate", summary: "The data is accurate" },
        { input: "Many users requested this", summary: "Few users wanted this" }
    ];

    for (const { input, summary } of testCases) {
        const isContradiction = quickContradictionCheck(input, summary);
        console.log(`Input: "${input}" | Summary: "${summary}" → ${isContradiction ? '❌ CONTRADICTION' : '✓ OK'}`);
    }
}

async function runAllTests() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  3-TIER ANALYSIS FALLBACK VERIFICATION               ║');
    console.log('║  Testing with AI offline (will use Tier 2 or 3)      ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    await testStemming();
    await testContradiction();
    await testSentiment();
    await testKeywords();
    await testConceptGap();

    console.log('\n✅ All tests completed. Check output above for results.');
}

runAllTests().catch(console.error);
