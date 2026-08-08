import { AnalysisResult, ParticipantInput, ParticipantAnalysis, AnalysisConfig, SensitivityResult } from '../types';
import { MOCK_SUMMARY } from '../constants';

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
};

const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const generateMockSummary = (strategy: string): { text: string, sentences: string[] } => {
  let text = "";
  if (strategy === 'diversity') {
    text = "The analysis highlights a wide spectrum of perspectives. While many users prioritize fixing technical bugs in the reporting app, distinct voices from Indigenous communities emphasize that ecological knowledge is being structurally excluded. There are divergent views on compensation: some view volunteering as civic duty, while low-income participants argue it creates barriers. Privacy remains a niche but critical concern regarding endangered species location data.";
  } else if (strategy === 'consensus') {
    text = "The group collectively agrees on three core pillars: the need for better mobile tools, the integration of local knowledge, and improved feedback loops. There is broad consensus that the current scientific protocols are too rigid. Participants uniformly requested more training and better recognition mechanisms. The primary shared goal is to move from data collection to true co-creation.";
  } else {
    text = MOCK_SUMMARY;
  }
  
  return {
    text,
    sentences: text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()) || []
  };
};

export const runAnalysis = async (inputs: ParticipantInput[], config: AnalysisConfig): Promise<AnalysisResult> => {
  const delay = Math.min(inputs.length * 10, 2000); 
  await new Promise(resolve => setTimeout(resolve, delay));

  const { text: summaryText, sentences: summarySentences } = generateMockSummary(config.strategy);

  const participants: ParticipantAnalysis[] = inputs.map((input, index) => {
    const seed = hashString(input.text + config.strategy);
    
    let x = (pseudoRandom(seed) * 200) - 100;
    let y = (pseudoRandom(seed + 1) * 200) - 100;
    
    if (input.text.toLowerCase().includes("knowledge") || input.text.toLowerCase().includes("indigenous")) { 
      x = -60 + (pseudoRandom(seed)*30); 
      y = 60 + (pseudoRandom(seed)*30); 
    }
    else if (input.text.toLowerCase().includes("app") || input.text.toLowerCase().includes("tool")) { 
      x = 60 + (pseudoRandom(seed)*30); 
      y = -40 + (pseudoRandom(seed)*30); 
    }
    else if (input.text.toLowerCase().includes("equity")) { 
      x = 0 + (pseudoRandom(seed)*30); 
      y = -80 + (pseudoRandom(seed)*30); 
    }

    let baseScore = 0.4 + (pseudoRandom(seed + 2) * 0.55); 
    if (config.strategy === 'diversity') {
       const isOutlier = Math.abs(x) > 80 || Math.abs(y) > 80;
       if (isOutlier) baseScore += 0.15;
    }

    const clusterId = Math.floor(pseudoRandom(seed + 3) * 3);
    const sentimentVal = pseudoRandom(seed + 5);
    const sentiment = sentimentVal > 0.6 ? 'positive' : sentimentVal < 0.3 ? 'negative' : 'neutral';

    // Mock Many-to-Many Matches
    const primaryMatchIdx = Math.floor(pseudoRandom(seed + 6) * summarySentences.length);
    const sentenceMatches = [{ sentenceIndex: primaryMatchIdx, similarity: Math.min(baseScore, 0.95) }];
    
    // Chance for secondary match
    if (pseudoRandom(seed + 7) > 0.6) {
        const secMatchIdx = (primaryMatchIdx + 1) % summarySentences.length;
        sentenceMatches.push({ sentenceIndex: secMatchIdx, similarity: baseScore * 0.7 });
    }

    const dist = Math.sqrt(x * x + y * y);
    const semanticIsolation = Math.min(dist / 141, 1);

    return {
      id: input.id,
      originalText: input.text,
      representationScore: Math.min(baseScore, 0.98),
      semanticIsolation,
      semanticCoords: { x, y },
      clusterId,
      sentenceMatches,
      topSentenceMatchIndex: primaryMatchIdx,
      sentiment,
      keywords: ["participation", "tools", "equity"]
    };
  });

  const scores = participants.map(p => p.representationScore).sort((a, b) => a - b);
  const n = scores.length;
  let num = 0;
  scores.forEach((val, i) => { num += (i + 1) * val; });
  const den = n * scores.reduce((a, b) => a + b, 0);
  const giniCoefficient = den === 0 ? 0 : (2 * num / den) - (n + 1) / n;

  let sensitivityAnalysis: SensitivityResult[] = [];
  if (config.runLOO) {
    sensitivityAnalysis = participants.map(p => ({
        participantId: p.id,
        shiftScore: pseudoRandom(hashString(p.id)) * 0.3,
        semanticDelta: pseudoRandom(hashString(p.id + 'd')) * 10
    })).sort((a,b) => b.shiftScore - a.shiftScore);
  }

  const summarySentenceSentiments = summarySentences.map((s, i) => {
      const val = pseudoRandom(i + 99);
      const label = val > 0.6 ? 'positive' : val < 0.3 ? 'negative' : 'neutral';
      return { score: val, label: label as 'positive' | 'neutral' | 'negative' };
  });

  return {
    config,
    summary: summaryText,
    summarySentences,
    summarySentenceSentiments,
    participants,
    metrics: {
      giniCoefficient: giniCoefficient,
      inputDiversity: 0.76, 
      coverageUniformity: 0.65, 
      distinctRepresentationGap: 0.12, 
      totalParticipants: inputs.length
    },
    clusters: [
      { id: 0, label: "Technical Tools", color: "#3b82f6" },
      { id: 1, label: "Social Equity", color: "#f97316" },
      { id: 2, label: "Methodology", color: "#10b981" },
    ],
    sensitivityAnalysis
  };
};
