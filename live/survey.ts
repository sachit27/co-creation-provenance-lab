import { createHash } from 'node:crypto';

export type SurveyAnswer = 1 | 2 | 3 | 4 | 5 | 'cannot_judge' | 'not_applicable' | 'prefer_not_to_answer' | 'not_shown';
export interface SurveyItem {
  id: string;
  prompt: string;
  anchors: [string, string, string, string, string];
  origin: 'built-in' | 'custom';
  construct: string;
}
export interface SurveyDefinition {
  version: number;
  digest: string;
  locale: string;
  items: SurveyItem[];
  createdAt: string;
}

export const DEFAULT_SURVEY_ITEMS: SurveyItem[] = [
  { id: 'coverage', prompt: 'How much of what mattered most in your contribution is included?', anchors: ['None', 'A little', 'Some', 'Most', 'All'], origin: 'built-in', construct: 'perceived-summary-coverage' },
  { id: 'meaning', prompt: 'Where included, how accurately does the summary convey what you meant?', anchors: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Completely accurately'], origin: 'built-in', construct: 'perceived-meaning-accuracy' },
  { id: 'emphasis', prompt: 'How well does the emphasis reflect what mattered most to you?', anchors: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Completely well'], origin: 'built-in', construct: 'perceived-emphasis' },
  { id: 'voice', prompt: 'How much opportunity did you have to express your views?', anchors: ['None', 'A little', 'Some', 'Most', 'All I needed'], origin: 'built-in', construct: 'perceived-voice-opportunity' },
  { id: 'fairness', prompt: 'How fairly did the facilitation treat different viewpoints?', anchors: ['Not at all', 'Slightly', 'Moderately', 'Very', 'Completely fairly'], origin: 'built-in', construct: 'perceived-process-fairness' },
  { id: 'understanding', prompt: 'How much did the session help you understand other viewpoints?', anchors: ['Not at all', 'A little', 'Somewhat', 'Quite a lot', 'A great deal'], origin: 'built-in', construct: 'perceived-understanding' },
];

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const digestSurvey = (locale: string, items: SurveyItem[]) => createHash('sha256').update(JSON.stringify({ locale, items })).digest('hex');

export function validateSurveyItems(input: unknown): SurveyItem[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 12) throw new Error('Add between 1 and 12 survey questions.');
  const seen = new Set<string>();
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid survey question.');
    const source = raw as Record<string, unknown>;
    const id = clean(source.id, 48);
    const prompt = clean(source.prompt, 300);
    if (!/^[a-z][a-z0-9_-]{2,47}$/.test(id) || seen.has(id)) throw new Error('Survey question IDs must be unique and stable.');
    seen.add(id);
    if (!prompt) throw new Error(`Question ${index + 1} needs wording.`);
    if (!Array.isArray(source.anchors) || source.anchors.length !== 5) throw new Error(`Question ${index + 1} needs five response labels.`);
    const anchors = source.anchors.map(value => clean(value, 80));
    if (anchors.some(value => !value)) throw new Error(`Question ${index + 1} has an empty response label.`);
    const builtIn = DEFAULT_SURVEY_ITEMS.find(item => item.id === id);
    const unchangedBuiltIn = source.origin === 'built-in' && builtIn?.prompt === prompt && builtIn.anchors.every((value, anchorIndex) => value === anchors[anchorIndex]);
    return {
      id, prompt, anchors: anchors as SurveyItem['anchors'],
      origin: unchangedBuiltIn ? 'built-in' : 'custom',
      construct: unchangedBuiltIn ? builtIn!.construct : 'facilitator-defined-unspecified',
    };
  });
}

export function newSurveyDefinition(items: SurveyItem[], version = 1): SurveyDefinition {
  const locale = 'en';
  return { version, digest: digestSurvey(locale, items), locale, items, createdAt: new Date().toISOString() };
}
