import React, { useState, useEffect, useRef } from 'react';
import { AnalysisConfig, ParticipantInput, StakeholderGroup, ColumnInfo, ColumnSelection, MultiColumnMode, AIProvider } from '../../types';
import { SAMPLE_DATA, SAMPLE_DATASETS, ANALYSIS_CONFIG } from '../../constants';
import { checkAIConnection, getGeminiModels, setRuntimeGeminiKey, DEFAULT_GEMINI_GENERATION_MODEL, DEFAULT_GEMINI_EMBEDDING_MODEL } from '../../services/gemini';
import { diagnoseOllamaConnection, filterOllamaEmbeddingModels, rankOllamaCompletionModels, setOllamaHost, getOllamaHostUrl, isUsingViteProxy } from '../../services/ollama';
import { checkBgeM3Connection, resetBgeM3Cache } from '../../services/bgeM3';
import { checkGroqConnection, verifyGroqConnection, setGroqApiKey, getGroqApiKey, isGroqKeyFromEnv, GROQ_FREE_MODELS, fetchGroqModels } from '../../services/groq';
import { checkOpenAIConnection, verifyOpenAIConnection, setOpenAIApiKey, getOpenAIApiKey, OPENAI_CHAT_MODELS, OPENAI_EMBEDDING_MODELS, fetchOpenAIChatModels } from '../../services/openai';
import { checkClaudeConnection, verifyClaudeConnection, setClaudeApiKey, getClaudeApiKey, CLAUDE_MODELS, fetchClaudeModels } from '../../services/claude';
import { checkApertusConnection, setApertusApiKey, getApertusApiKey, APERTUS_MODELS, fetchApertusModels, PublicAIModelInfo } from '../../services/apertus';
import { preprocessCSV, scanColumns, preprocessWithSelections, PreprocessReport, PreprocessResult, parseMultiDocumentText, chunkSingleDocument } from '../../services/dataPreprocessor';
import { ColumnSelector } from './ColumnSelector';
import { clearEmbeddingCache, isPersistentEmbeddingCacheEnabled, setPersistentEmbeddingCacheEnabled } from '../../services/embeddingCache';

interface ConfigPanelProps {
  onRun: (
    inputs: ParticipantInput[],
    config: AnalysisConfig,
    multiQuestion?: { rawCsvText: string; selection: ColumnSelection; columns: ColumnInfo[] }
  ) => void;
}

// Column detection result
interface ColumnMapping {
  idColumn: number;
  textColumn: number;
  groupColumn: number | null;
  headers: string[];
  hasHeaders: boolean;
}

// Template CSV content
const TEMPLATE_CSV = `participant_id,contribution,stakeholder_group
P001,"I think we need more green spaces in the city center for community gatherings.",community
P002,"As an urban planner, I recommend focusing on sustainable drainage systems.",expert
P003,"Young people want more bike lanes and skate parks in the neighborhood.",youth
P004,"The city budget should prioritize infrastructure maintenance first.",government
P005,"Local businesses would benefit from improved parking facilities.",business
P006,"We should preserve the historic buildings while allowing modern development.",community
P007,"Environmental impact assessments should be mandatory for all projects.",expert
P008,"Students need more affordable housing options near the university.",youth`;

// Domain preset templates
const DOMAIN_PRESETS = [
  { id: 'legal', label: 'Legal / Depositions', context: 'These are legal testimonies, depositions, and witness statements.', biasHint: 'Watch for the softening of liability claims or sanitization of accusations.' },
  { id: 'finance', label: 'Financial / 10-K', context: 'These are excerpts from corporate earnings calls and 10-K financial filings.', biasHint: 'Watch for speculative forward-guidance or omission of risk factors.' },
  { id: 'healthcare', label: 'Clinical / Medical', context: 'These are patient records, clinical trial results, and medical notes.', biasHint: 'Watch for abstraction of concrete adverse events or omission of null results.' },
  { id: 'policy', label: 'Policy / Gov', context: 'These are public consultations, committee reports, and policy memos.', biasHint: 'Ensure minority stakeholder voices are not marginalized or dropped.' },
  { id: 'academic', label: 'Academic / Research', context: 'These are academic literature reviews and peer review reports.', biasHint: 'Watch for softened negative findings or dropped contradictory evidence.' },
  { id: 'media', label: 'Journalism / Media', context: 'These are press releases, interview transcripts, and media statements.', biasHint: 'Watch for cross-source claims becoming speculative or abstracted.' },
];

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ onRun }) => {
  const [step, setStep] = useState<number>(1);
  const [inputs, setInputs] = useState<ParticipantInput[]>([]);
  const [inputType, setInputType] = useState<'sample' | 'paste' | 'upload' | 'multi_doc' | 'single_doc'>('sample');
  // Multi-document mode state
  const [multiDocTexts, setMultiDocTexts] = useState<string[]>(['', '']);
  const [multiDocLabels, setMultiDocLabels] = useState<string[]>(['', '']);
  // Single-document mode state
  const [singleDocText, setSingleDocText] = useState<string>('');
  const [chunkStrategy, setChunkStrategy] = useState<'paragraph' | 'sentence' | 'section'>('paragraph');
  const [selectedDataset, setSelectedDataset] = useState<string>('citizen');
  const [rawText, setRawText] = useState('');
  const [persistEmbeddings, setPersistEmbeddings] = useState(() => isPersistentEmbeddingCacheEnabled());
  const [cacheCleared, setCacheCleared] = useState(false);

  // Validation / Preview state
  const [parsedPreview, setParsedPreview] = useState<ParticipantInput[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [preprocessReport, setPreprocessReport] = useState<PreprocessReport | null>(null);

  // Column selection state (upload path only)
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [scannedColumns, setScannedColumns] = useState<ColumnInfo[]>([]);
  const [columnSelection, setColumnSelection] = useState<ColumnSelection>({ idColumnIndex: -1, textColumnIndices: [], groupColumnIndex: -1 });
  const [multiColumnMode, setMultiColumnMode] = useState<MultiColumnMode>('combined');

  // Pagination State
  const [previewPage, setPreviewPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Status check states
  const [geminiStatus, setGeminiStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [groqStatus, setGroqStatus] = useState<'checking' | 'connected' | 'offline'>('offline');
  const [openAIStatus, setOpenAIStatus] = useState<'checking' | 'connected' | 'offline'>('offline');
  const [claudeStatus, setClaudeStatus] = useState<'checking' | 'connected' | 'offline'>('offline');
  const [apertusStatus, setApertusStatus] = useState<'checking' | 'connected' | 'offline'>('offline');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const ollamaCompletionModels = rankOllamaCompletionModels(ollamaModels);
  const ollamaEmbeddingModels = filterOllamaEmbeddingModels(ollamaModels);
  const [geminiModels, setGeminiModels] = useState<{ generation: string[]; embedding: string[] }>({ generation: [], embedding: [] });
  const [openAIModels, setOpenAIModels] = useState<string[]>(OPENAI_CHAT_MODELS);
  const [groqModels, setGroqModels] = useState<string[]>(GROQ_FREE_MODELS);
  const [claudeModels, setClaudeModels] = useState<string[]>(CLAUDE_MODELS);
  const [apertusModels, setApertusModels] = useState<string[]>(APERTUS_MODELS);
  const [apertusModelInfo, setApertusModelInfo] = useState<PublicAIModelInfo[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<'openai' | 'groq' | 'claude' | 'apertus' | null>(null);
  const [bgeM3Status, setBgeM3Status] = useState<'checking' | 'connected' | 'offline'>('checking');
  // API key inputs — values are written to sessionStorage. Provider routing is
  // disclosed in the corresponding UI. Apertus uses the Vite relay during
  // local development; the public static build has no provider relay.
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [groqKeyInput, setGroqKeyInput] = useState(() => getGroqApiKey());
  const [openAIKeyInput, setOpenAIKeyInput] = useState(() => getOpenAIApiKey());
  const [claudeKeyInput, setClaudeKeyInput] = useState(() => getClaudeApiKey());
  const [apertusKeyInput, setApertusKeyInput] = useState(() => getApertusApiKey());
  // Ollama host URL for non-Vite hosts, including the static demonstration.
  const [ollamaHostInput, setOllamaHostInput] = useState(() => isUsingViteProxy() ? '' : getOllamaHostUrl());
  const [ollamaConnectionMessage, setOllamaConnectionMessage] = useState('');
  const ollamaValidationSequence = useRef(0);
  const apertusValidationSequence = useRef(0);

  const [config, setConfig] = useState<AnalysisConfig>({
    datasetName: 'Citizen Feedback Project',
    strategy: 'balanced',
    aiProvider: checkGroqConnection() ? 'groq'
      : checkOpenAIConnection() ? 'openai'
        : checkClaudeConnection() ? 'claude'
          : checkApertusConnection() ? 'apertus'
            : 'gemini',
    model: checkGroqConnection() ? GROQ_FREE_MODELS[0]
      : checkOpenAIConnection() ? OPENAI_CHAT_MODELS[0]
        : checkClaudeConnection() ? claudeModels[0]
          : checkApertusConnection() ? APERTUS_MODELS[0]
            : DEFAULT_GEMINI_GENERATION_MODEL,
    embeddingModel: checkOpenAIConnection() ? 'text-embedding-3-small' : DEFAULT_GEMINI_EMBEDDING_MODEL,
    embeddingProvider: checkOpenAIConnection() ? 'openai' : 'gemini',
    runLOO: true,
    summaryMethod: 'ai',
    manualSummaryText: '',
    summaryProvenance: { origin: 'generated-in-run' },
  });

  const reconcileCompletionCatalog = (prev: AnalysisConfig, provider: AIProvider, models: string[]): AnalysisConfig => {
    if (models.length === 0) return prev;
    const next = { ...prev };
    if (prev.aiProvider === provider && !models.includes(prev.model)) next.model = models[0];
    if (prev.evaluatorProvider === provider && (!prev.evaluatorModel || !models.includes(prev.evaluatorModel))) {
      next.evaluatorModel = models[0];
    }
    return next;
  };

  // Helper: fetch live models for a provider and update state
  const refreshOpenAIModels = async () => {
    setIsFetchingModels('openai');
    try {
      const models = await fetchOpenAIChatModels();
      setOpenAIModels(models);
      setConfig(prev => reconcileCompletionCatalog(prev, 'openai', models.length ? models : OPENAI_CHAT_MODELS));
    } finally {
      setIsFetchingModels(null);
    }
  };

  const refreshClaudeModels = async () => {
    setIsFetchingModels('claude');
    try {
      const models = await fetchClaudeModels();
      setClaudeModels(models);
      setConfig(prev => reconcileCompletionCatalog(prev, 'claude', models.length ? models : CLAUDE_MODELS));
    } finally {
      setIsFetchingModels(null);
    }
  };

  const refreshGroqModels = async () => {
    setIsFetchingModels('groq');
    try {
      const models = await fetchGroqModels();
      setGroqModels(models);
      setConfig(prev => reconcileCompletionCatalog(prev, 'groq', models.length ? models : GROQ_FREE_MODELS));
    } finally {
      setIsFetchingModels(null);
    }
  };

  const runOllamaConnectionCheck = async () => {
    const sequence = ++ollamaValidationSequence.current;
    setOllamaStatus('checking');
    setOllamaConnectionMessage('Testing from this browser…');
    const diagnostic = await diagnoseOllamaConnection();
    if (sequence !== ollamaValidationSequence.current) return;
    setOllamaStatus(diagnostic.connected ? 'connected' : 'offline');
    setOllamaConnectionMessage(diagnostic.message);
    setOllamaModels(diagnostic.models);
    if (diagnostic.connected) {
      const completionModels = rankOllamaCompletionModels(diagnostic.models);
      setConfig(prev => {
        if (prev.aiProvider !== 'ollama' || completionModels.length === 0) return prev;
        return completionModels.includes(prev.model) ? prev : { ...prev, model: completionModels[0] };
      });
    }
  };

  // Check connections on mount
  useEffect(() => {
    checkAIConnection().then(async connected => {
      setGeminiStatus(connected ? 'connected' : 'offline');
      if (connected) {
        const models = await getGeminiModels();
        setGeminiModels(models);
        if (models.generation.length > 0 && config.aiProvider === 'gemini') {
          const defaultGen = models.generation.find(m => m === DEFAULT_GEMINI_GENERATION_MODEL) || models.generation[0];
          const defaultEmbed = models.embedding.find(m => m === DEFAULT_GEMINI_EMBEDDING_MODEL) || models.embedding[0] || DEFAULT_GEMINI_EMBEDDING_MODEL;
          setConfig(prev => ({ ...prev, model: defaultGen, embeddingModel: defaultEmbed }));
        }
      }
    });
    void runOllamaConnectionCheck();
    // A stored key is not a verified connection. Test authentication before
    // enabling an AI run or showing a provider as connected.
    if (checkGroqConnection()) {
      setGroqStatus('checking');
      verifyGroqConnection().then(ok => setGroqStatus(ok ? 'connected' : 'offline'));
    }
    if (checkOpenAIConnection()) {
      setOpenAIStatus('checking');
      verifyOpenAIConnection().then(ok => setOpenAIStatus(ok ? 'connected' : 'offline'));
    }
    if (checkClaudeConnection()) {
      setClaudeStatus('checking');
      verifyClaudeConnection().then(ok => {
        setClaudeStatus(ok ? 'connected' : 'offline');
        if (ok) refreshClaudeModels();
      });
    }
    // Apertus: key presence is not a connection test. Verify against /models.
    if (checkApertusConnection()) {
      const sequence = ++apertusValidationSequence.current;
      fetchApertusModels().then(models => {
        if (sequence !== apertusValidationSequence.current) return;
        const ids = models.map(model => model.id);
        setApertusModelInfo(models);
        setApertusModels(ids.length > 0 ? ids : APERTUS_MODELS);
        setApertusStatus(ids.length > 0 ? 'connected' : 'offline');
      }).catch(() => {
        if (sequence === apertusValidationSequence.current) setApertusStatus('offline');
      });
    }
    // BGE-M3 check (independent — used for embeddings regardless of provider)
    resetBgeM3Cache();
    checkBgeM3Connection().then(connected => setBgeM3Status(connected ? 'connected' : 'offline'));
  }, []);

  // Select an available embedding provider using the documented fallback order.
  // This is used as the default so non-expert users always get optimal quality.
  // Experts can still override via the Embedding Model dropdown.
  const getBestEmbeddingConfig = (): { embeddingProvider: AnalysisConfig['embeddingProvider']; embeddingModel: string } => {
    if (bgeM3Status === 'connected') return { embeddingProvider: 'bge-m3', embeddingModel: 'bge-m3' };
    if (openAIStatus === 'connected') return { embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small' };
    if (geminiStatus === 'connected') return { embeddingProvider: 'gemini', embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL };
    if (ollamaStatus === 'connected' && ollamaEmbeddingModels.length > 0) {
      const embModel = ollamaEmbeddingModels.find(m => m === 'qwen3-embedding:8b') || ollamaEmbeddingModels[0];
      return { embeddingProvider: 'ollama', embeddingModel: embModel };
    }
    return { embeddingProvider: 'tfidf', embeddingModel: 'tfidf' };
  };

  // Update defaults when switching provider
  useEffect(() => {
    const bestEmb = getBestEmbeddingConfig();

    if (config.aiProvider === 'ollama') {
      const defaultGen = ollamaCompletionModels[0] || 'qwen3:30b-instruct';
      setConfig(prev => ({
        ...prev,
        model: ollamaCompletionModels.includes(prev.model) ? prev.model : defaultGen,
        ...bestEmb,
      }));
    } else if (config.aiProvider === 'groq') {
      setConfig(prev => ({ ...prev, model: groqModels[0] || GROQ_FREE_MODELS[0], ...bestEmb }));
    } else if (config.aiProvider === 'openai') {
      setConfig(prev => ({ ...prev, model: openAIModels[0] || OPENAI_CHAT_MODELS[0], ...bestEmb }));
    } else if (config.aiProvider === 'claude') {
      setConfig(prev => ({ ...prev, model: claudeModels[0] || CLAUDE_MODELS[0], ...bestEmb }));
    } else if (config.aiProvider === 'apertus') {
      setConfig(prev => ({ ...prev, model: apertusModels[0] || APERTUS_MODELS[0], ...bestEmb }));
    } else {
      const defaultGen = geminiModels.generation.find(m => m === DEFAULT_GEMINI_GENERATION_MODEL) || geminiModels.generation[0] || DEFAULT_GEMINI_GENERATION_MODEL;
      setConfig(prev => ({ ...prev, model: defaultGen, ...bestEmb }));
    }
  }, [config.aiProvider, ollamaModels, geminiModels, openAIModels, groqModels, claudeModels, apertusModels, bgeM3Status, openAIStatus, geminiStatus, ollamaStatus]);

  // State Management for Inputs
  useEffect(() => {
    setUploadError(null);
    setPreviewPage(1);

    if (inputType === 'sample') {
      const ds = SAMPLE_DATASETS[selectedDataset] || SAMPLE_DATASETS.citizen;
      const data = ds.data;
      setInputs(data);
      setParsedPreview(data);
    } else if (inputType === 'paste') {
      const parsed = parseRawText(rawText);
      setInputs(parsed);
      setParsedPreview(parsed);
    } else if (inputType === 'multi_doc') {
      const parsed = parseMultiDocumentText(
        multiDocTexts.filter(t => t.trim().length > 0),
        multiDocLabels.filter((_, i) => multiDocTexts[i]?.trim().length > 0),
      );
      setInputs(parsed);
      setParsedPreview(parsed);
    } else if (inputType === 'single_doc') {
      const parsed = chunkSingleDocument(singleDocText, chunkStrategy);
      setInputs(parsed);
      setParsedPreview(parsed);
    } else {
      // Upload mode reset if needed
      if (inputs.length === 0) setParsedPreview([]);
    }
  }, [inputType, rawText, selectedDataset, multiDocTexts, multiDocLabels, singleDocText, chunkStrategy]);

  // Download template CSV
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'participant_data_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Detect column mapping from headers
  const detectColumns = (headerRow: string): ColumnMapping => {
    const headers = parseCSVRow(headerRow).map(h => h.toLowerCase().trim());

    // ID column detection
    const idPatterns = ['id', 'participant_id', 'participant', 'user_id', 'user', 'respondent'];
    let idColumn = headers.findIndex(h => idPatterns.some(p => h.includes(p)));

    // Text column detection
    const textPatterns = ['text', 'contribution', 'feedback', 'input', 'response', 'comment', 'content', 'message'];
    let textColumn = headers.findIndex(h => textPatterns.some(p => h.includes(p)));

    // Group column detection
    const groupPatterns = ['group', 'stakeholder', 'category', 'type', 'role', 'affiliation'];
    let groupColumn: number | null = headers.findIndex(h => groupPatterns.some(p => h.includes(p)));
    if (groupColumn === -1) groupColumn = null;

    // Check if this looks like a header row
    const hasHeaders = idColumn !== -1 || textColumn !== -1;

    // Fallback: assume first column is ID, second is text
    if (idColumn === -1) idColumn = 0;
    if (textColumn === -1) textColumn = headers.length > 1 ? 1 : 0;

    return { idColumn, textColumn, groupColumn, headers, hasHeaders };
  };

  // Parse CSV row handling quoted fields
  const parseCSVRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  };

  // Map string to StakeholderGroup
  const parseGroup = (groupStr: string): StakeholderGroup | undefined => {
    const normalized = groupStr.toLowerCase().trim();
    const groupMap: Record<string, StakeholderGroup> = {
      'community': 'community',
      'citizen': 'community',
      'resident': 'community',
      'expert': 'expert',
      'professional': 'expert',
      'scientist': 'expert',
      'youth': 'youth',
      'student': 'youth',
      'young': 'youth',
      'government': 'government',
      'official': 'government',
      'policy': 'government',
      'business': 'business',
      'company': 'business',
      'corporate': 'business',
      'other': 'other'
    };

    for (const [key, value] of Object.entries(groupMap)) {
      if (normalized.includes(key)) return value;
    }
    return normalized.length > 0 ? 'other' : undefined;
  };

  const parseRawText = (text: string): ParticipantInput[] => {
    if (!text) return [];
    setColumnMapping(null);

    return text.split('\n')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map((line, i) => {
        // Support "ID, Text" or "ID, Text, Group" format in paste
        const parts = parseCSVRow(line);
        const looksLikeId = /^[A-Za-z0-9_.-]{1,40}$/.test(parts[0] ?? '');
        if (parts.length >= 2 && looksLikeId) {
          const knownGroup = parts.length >= 3 && /^(community|citizen|resident|expert|professional|scientist|youth|student|young|government|official|policy|business|company|corporate|other)$/i.test(parts[parts.length - 1]);
          const result: ParticipantInput = {
            id: parts[0],
            text: (knownGroup ? parts.slice(1, -1) : parts.slice(1)).join(', ').trim()
          };
          if (knownGroup) {
            result.group = parseGroup(parts[parts.length - 1]);
          }
          return result;
        }
        return { id: `P_${i + 1}`, text: line };
      });
  };

  // Handle per-slot .txt / .md uploads in multi_doc mode
  const handleTextFileUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      const newTexts = [...multiDocTexts];
      newTexts[index] = content;
      const newLabels = [...multiDocLabels];
      if (!newLabels[index] || newLabels[index] === `Source ${index + 1}`) {
        newLabels[index] = file.name.replace(/\.[^/.]+$/, "");
      }
      setMultiDocTexts(newTexts);
      setMultiDocLabels(newLabels);
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so same file can be selected again
  };

  const processUploadedFile = (file: File) => {
    setUploadError(null);
    setColumnMapping(null);
    setPreprocessReport(null);
    setScannedColumns([]);
    setRawCsvText('');
    setInputs([]);
    setParsedPreview([]);
    setColumnSelection({ idColumnIndex: -1, textColumnIndices: [], groupColumnIndex: -1 });

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.tsv') && !lowerName.endsWith('.txt')) {
      setUploadError("Invalid file type. Please upload a .csv, .tsv, or .txt file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const raw = evt.target?.result as string;
        if (!raw || raw.trim().length === 0) { setUploadError("File appears empty."); return; }

        const cols = scanColumns(raw);
        if (cols.length === 0) { setUploadError("Could not parse column headers."); return; }

        setRawCsvText(raw);
        setScannedColumns(cols);

        // Auto-suggest initial selections
        const idCol = cols.find(c => c.suggestedType === 'id');
        const textCols = cols.filter(c => c.suggestedType === 'text');
        const groupCol = cols.find(c => c.suggestedType === 'group');
        setColumnSelection({
          idColumnIndex: idCol?.index ?? -1,
          textColumnIndices: textCols.map(c => c.index),
          groupColumnIndex: groupCol?.index ?? -1,
        });
      } catch {
        setUploadError("Failed to parse file. Please check the format.");
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processUploadedFile(file);
    e.target.value = '';
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processUploadedFile(file);
  };

  // Called when user confirms column selection (step 2 → step 3)
  const handleConfirmColumns = () => {
    if (!rawCsvText || columnSelection.textColumnIndices.length === 0) return;
    try {
      // For preview always use combined (fast)
      const result = preprocessWithSelections(rawCsvText, columnSelection, 'combined', scannedColumns) as PreprocessResult;
      setPreprocessReport(result.report);
      if (result.inputs.length === 0) {
        setUploadError(`No valid responses after filtering. ${result.report.droppedRows.length} rows removed.`);
        return;
      }
      setInputs(result.inputs);
      setParsedPreview(result.inputs);
      setPreviewPage(1);
    } catch {
      setUploadError("Column selection produced no valid data.");
    }
    setStep(3);
  };

  const totalSteps = inputType === 'upload' && scannedColumns.length > 0 ? 3 : 2;

  const handleNext = () => {
    if (step === 1 && totalSteps === 3) {
      setStep(2); // go to column selector
    } else if (step === 2 && totalSteps === 3) {
      handleConfirmColumns(); // confirm columns → step 3
    } else {
      setStep(step + 1);
    }
  };

  const handleRunClick = () => {
    if (config.summaryMethod === 'ai' && currentStatus !== 'connected') {
      setUploadError(`Verify a working ${providerLabel} connection or choose Extractive / Manual summary mode before running.`);
      return;
    }
    if (inputType === 'upload' && multiColumnMode === 'per_question' && columnSelection.textColumnIndices.length > 1) {
      onRun(inputs, config, { rawCsvText, selection: columnSelection, columns: scannedColumns });
    } else {
      onRun(inputs, config);
    }
  };

  // Pagination helpers
  const totalPages = Math.ceil(parsedPreview.length / ITEMS_PER_PAGE);
  const currentItems = parsedPreview.slice((previewPage - 1) * ITEMS_PER_PAGE, previewPage * ITEMS_PER_PAGE);

  const currentStatus = config.aiProvider === 'ollama'
    ? ollamaStatus
    : config.aiProvider === 'groq'
      ? groqStatus
      : config.aiProvider === 'openai'
        ? openAIStatus
        : config.aiProvider === 'claude'
          ? claudeStatus
          : config.aiProvider === 'apertus'
            ? apertusStatus
            : geminiStatus;

  // Helpers: provider display name
  const providerLabel = (
    config.aiProvider === 'gemini' ? 'Gemini' :
      config.aiProvider === 'groq' ? 'Groq' :
        config.aiProvider === 'ollama' ? 'Ollama' :
          config.aiProvider === 'openai' ? 'OpenAI' :
            config.aiProvider === 'claude' ? 'Claude' :
              'Apertus'
  );
  const completionModelsForCurrentProvider = config.aiProvider === 'gemini'
    ? (geminiModels.generation.length > 0 ? geminiModels.generation : [DEFAULT_GEMINI_GENERATION_MODEL])
    : config.aiProvider === 'groq'
      ? groqModels
      : config.aiProvider === 'openai'
        ? openAIModels
        : config.aiProvider === 'claude'
          ? claudeModels
          : config.aiProvider === 'apertus'
            ? apertusModels
            : ollamaCompletionModels;
  const modelsForProvider = (provider: AIProvider): string[] => provider === 'gemini'
    ? (geminiModels.generation.length > 0 ? geminiModels.generation : [DEFAULT_GEMINI_GENERATION_MODEL])
    : provider === 'groq' ? groqModels
      : provider === 'openai' ? openAIModels
        : provider === 'claude' ? claudeModels
          : provider === 'apertus' ? apertusModels
            : ollamaCompletionModels;
  const statusForProvider = (provider: AIProvider) => provider === 'gemini' ? geminiStatus
    : provider === 'groq' ? groqStatus
      : provider === 'openai' ? openAIStatus
        : provider === 'claude' ? claudeStatus
          : provider === 'apertus' ? apertusStatus
            : ollamaStatus;
  const labelForProvider = (provider: AIProvider) => ({
    gemini: 'Gemini', groq: 'Groq', ollama: 'Ollama', openai: 'OpenAI', claude: 'Claude', apertus: 'Apertus',
  }[provider]);
  const evaluatorProvider = config.evaluatorProvider ?? config.aiProvider;
  const evaluatorModels = modelsForProvider(evaluatorProvider);
  const evaluatorStatus = statusForProvider(evaluatorProvider);
  const providerIsUsed = (provider: AIProvider) => config.aiProvider === provider || evaluatorProvider === provider;

  // Handle runtime Gemini key entry
  const handleGeminiKeyChange = (key: string) => {
    setGeminiKeyInput(key);
    setRuntimeGeminiKey(key);
    setGeminiStatus('checking');
    checkAIConnection().then(async connected => {
      setGeminiStatus(connected ? 'connected' : 'offline');
      if (connected) {
        const models = await getGeminiModels();
        setGeminiModels(models);
        setConfig(prev => reconcileCompletionCatalog(prev, 'gemini', models.generation));
      }
    });
  };

  // Handle Groq key entry — fetch live models after key is set
  const handleGroqKeyChange = (key: string) => {
    setGroqKeyInput(key);
    setGroqApiKey(key);
    if (key.trim().length <= 5) { setGroqStatus('offline'); return; }
    setGroqStatus('checking');
    verifyGroqConnection().then(connected => {
      setGroqStatus(connected ? 'connected' : 'offline');
      if (connected) refreshGroqModels();
    });
  };

  // Handle OpenAI key entry — fetch live models after key is set
  const handleOpenAIKeyChange = (key: string) => {
    setOpenAIKeyInput(key);
    setOpenAIApiKey(key);
    if (key.trim().length <= 5) { setOpenAIStatus('offline'); return; }
    setOpenAIStatus('checking');
    verifyOpenAIConnection().then(connected => {
      setOpenAIStatus(connected ? 'connected' : 'offline');
      if (connected) refreshOpenAIModels();
    });
  };

  // Handle Claude key entry
  const handleClaudeKeyChange = (key: string) => {
    setClaudeKeyInput(key);
    setClaudeApiKey(key);
    if (key.trim().length <= 5) { setClaudeStatus('offline'); return; }
    setClaudeStatus('checking');
    verifyClaudeConnection().then(connected => {
      setClaudeStatus(connected ? 'connected' : 'offline');
      // Pull the live catalogue as soon as the key works, so the picker reflects
      // what this account can actually call rather than a list baked into the build.
      if (connected) refreshClaudeModels();
    });
  };

  // Handle Apertus key entry
  const handleApertusKeyChange = (key: string) => {
    setApertusKeyInput(key);
    setApertusApiKey(key);
    setApertusStatus(key.trim().length >= 10 ? 'checking' : 'offline');
    const sequence = ++apertusValidationSequence.current;
    if (key.trim().length < 10) return;
    fetchApertusModels().then(models => {
      if (sequence !== apertusValidationSequence.current) return;
      const ids = models.map(model => model.id);
      setApertusModelInfo(models);
      setApertusModels(ids.length > 0 ? ids : APERTUS_MODELS);
      setApertusStatus(ids.length > 0 ? 'connected' : 'offline');
      setConfig(prev => reconcileCompletionCatalog(prev, 'apertus', ids.length > 0 ? ids : APERTUS_MODELS));
    }).catch(() => {
      if (sequence === apertusValidationSequence.current) setApertusStatus('offline');
    });
  };

  // Handle an explicit Ollama host for static or non-Vite deployments.
  const handleOllamaHostInputChange = (host: string) => {
    setOllamaHostInput(host);
    ++ollamaValidationSequence.current;
    setOllamaStatus('offline');
    setOllamaConnectionMessage('Host changed. Select Test connection to apply it.');
  };

  const handleOllamaHostTest = () => {
    setOllamaHost(ollamaHostInput);
    void runOllamaConnectionCheck();
  };

  return (
    <div className="max-w-4xl mx-auto mt-12 animate-slideUp">
      {/* Stepper */}
      <div className="flex items-center justify-center mb-12">
        <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600' : 'text-slate-300'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= 1 ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>1</div>
          <span className="font-semibold text-sm">Data Source</span>
        </div>
        <div className={`w-12 h-[2px] mx-3 ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`} />
        {totalSteps === 3 && (
          <>
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600' : 'text-slate-300'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= 2 ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>2</div>
              <span className="font-semibold text-sm">Columns</span>
            </div>
            <div className={`w-12 h-[2px] mx-3 ${step >= 3 ? 'bg-blue-600' : 'bg-slate-200'}`} />
          </>
        )}
        <div className={`flex items-center gap-2 ${step >= totalSteps ? 'text-blue-600' : 'text-slate-300'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${step >= totalSteps ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>{totalSteps}</div>
          <span className="font-semibold text-sm">Configuration</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/60 overflow-hidden">
        <div className="p-8">
          {step === 1 && (
            <div className="space-y-8 animate-fadeIn">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800">Upload Data</h2>
                <p className="text-slate-500 mt-2">Select how you want to import participant contributions.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {[
                  { id: 'sample', icon: '📊', label: 'Sample Data', desc: 'Pre-loaded dataset' },
                  { id: 'paste', icon: '✍️', label: 'Paste Text', desc: 'CSV or line-per-input' },
                  { id: 'upload', icon: '📂', label: 'Upload CSV', desc: 'Auto-detect columns' },
                  { id: 'multi_doc', icon: '📄', label: 'Multi-Document', desc: 'Multiple text sources' },
                  { id: 'single_doc', icon: '📃', label: 'Document Segments', desc: 'Single doc auto-chunked' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setInputType(opt.id as any);
                      if (opt.id === 'paste' && inputs.length === 0) setRawText('');
                    }}
                    className={`p-4 rounded-xl border-2 text-left transition-all duration-200 group ${inputType === opt.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{opt.icon}</div>
                    <div className={`font-bold text-sm ${inputType === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                <div className="mb-6">
                  {inputType === 'sample' && (
                    <div className="space-y-3">
                      <select
                        value={selectedDataset}
                        onChange={(e) => setSelectedDataset(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        {Object.entries(SAMPLE_DATASETS).map(([key, ds]) => (
                          <option key={key} value={key}>{ds.label} — {ds.data.length} inputs</option>
                        ))}
                      </select>
                      <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-green-200 bg-green-50/50 rounded-lg">
                        <div className="text-green-600 font-bold mb-1">Dataset Loaded</div>
                        <div className="text-slate-600 font-medium text-sm">{SAMPLE_DATASETS[selectedDataset]?.label || 'Nature-Based Solutions'}</div>
                        <div className="text-slate-400 text-xs mt-1">{SAMPLE_DATASETS[selectedDataset]?.description}</div>
                      </div>
                    </div>
                  )}
                  {inputType === 'paste' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Paste Contributions (One per line)</label>
                      <textarea
                        className="w-full h-40 p-4 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 font-mono"
                        placeholder={'User_01, "The app crashes often, especially offline"\nUser_02, I need better tools'}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                      />
                      <p className="text-xs text-slate-500 mt-2">One contribution per line. Optional CSV-style ID first; quote content containing commas. Short, numeric, refusal, and uncertainty responses are retained.</p>
                    </div>
                  )}
                  {inputType === 'upload' && (
                    <div className="space-y-3">
                      <div
                        className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-300 rounded-lg hover:bg-white transition-colors relative group"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleFileDrop}
                      >
                        <input
                          type="file"
                          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                          onChange={handleFileUpload}
                          className="absolute opacity-0 w-full h-full cursor-pointer z-10"
                        />
                        <div className="text-4xl mb-3 text-slate-300 group-hover:text-blue-400 transition-colors">📄</div>
                        <span className="text-sm font-medium text-slate-600">Click to browse or drag a CSV, TSV, or text file</span>
                        <span className="text-xs text-slate-400 mt-1">Auto-detects columns: ID, Text, Group (optional)</span>
                        {uploadError && (
                          <div className="absolute bottom-2 left-0 w-full text-center text-red-500 text-xs font-bold">{uploadError}</div>
                        )}
                      </div>

                      {/* Template download and help */}
                      <div className="flex items-center justify-between bg-blue-50 rounded-lg px-4 py-3 border border-blue-100">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-500">💡</span>
                          <span className="text-sm text-blue-700">Need a template? Download our sample CSV with example data.</span>
                        </div>
                        <button
                          onClick={downloadTemplate}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Template
                        </button>
                      </div>

                      {/* Column detection feedback */}
                      {columnMapping && columnMapping.hasHeaders && (
                        <div className="bg-green-50 rounded-lg px-4 py-3 border border-green-200 animate-fadeIn">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-green-600">✓</span>
                            <span className="text-sm font-medium text-green-800">Columns Detected</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              ID: {columnMapping.headers[columnMapping.idColumn] || 'Column 1'}
                            </span>
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              Text: {columnMapping.headers[columnMapping.textColumn] || 'Column 2'}
                            </span>
                            {columnMapping.groupColumn !== null && (
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                                Group: {columnMapping.headers[columnMapping.groupColumn] || 'Column 3'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {inputType === 'multi_doc' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">Paste multiple text sources (e.g., witness statements, earnings transcripts, policy memos). Each block is analyzed as one source.</p>
                      {multiDocTexts.map((text, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <div className="flex-shrink-0 w-28 flex flex-col gap-2">
                            <input
                              type="text"
                              value={multiDocLabels[i] || ''}
                              onChange={(e) => {
                                const newLabels = [...multiDocLabels];
                                newLabels[i] = e.target.value;
                                setMultiDocLabels(newLabels);
                              }}
                              placeholder={`Source ${i + 1}`}
                              className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            />
                            <div className="relative w-full">
                              <input
                                type="file"
                                accept=".txt,.md,.csv"
                                onChange={(e) => handleTextFileUpload(e, i)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                title="Upload .txt or .md file"
                              />
                              <button type="button" className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 transition-colors border border-slate-200">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                Upload .TXT
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={text}
                            onChange={(e) => {
                              const newTexts = [...multiDocTexts];
                              newTexts[i] = e.target.value;
                              setMultiDocTexts(newTexts);
                            }}
                            rows={3}
                            className="flex-1 p-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400"
                            placeholder={`Paste source text #${i + 1} here...`}
                          />
                          {multiDocTexts.length > 2 && (
                            <button
                              onClick={() => {
                                setMultiDocTexts(multiDocTexts.filter((_, j) => j !== i));
                                setMultiDocLabels(multiDocLabels.filter((_, j) => j !== i));
                              }}
                              className="text-slate-400 hover:text-red-500 text-sm flex-shrink-0 mt-2"
                            >✕</button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setMultiDocTexts([...multiDocTexts, '']);
                          setMultiDocLabels([...multiDocLabels, '']);
                        }}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      >
                        + Add Another Source
                      </button>
                    </div>
                  )}

                  {inputType === 'single_doc' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">Paste a single long document. It will be automatically segmented into chunks for provenance analysis.</p>
                      <textarea
                        value={singleDocText}
                        onChange={(e) => setSingleDocText(e.target.value)}
                        rows={6}
                        className="w-full p-4 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 font-mono"
                        placeholder="Paste the full document text here. The tool will auto-segment it into source chunks..."
                      />
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-semibold text-slate-600">Chunking Strategy:</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="chunkStrategy" checked={chunkStrategy === 'paragraph'} onChange={() => setChunkStrategy('paragraph')} className="accent-blue-600" />
                          <span className="text-sm text-slate-700">By Paragraph</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="chunkStrategy" checked={chunkStrategy === 'sentence'} onChange={() => setChunkStrategy('sentence')} className="accent-blue-600" />
                          <span className="text-sm text-slate-700">By Sentence</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer" title="Auto-detects semantic sections like 'ITEM 1A' or '§3.1' as provenance IDs">
                          <input type="radio" name="chunkStrategy" checked={chunkStrategy === 'section'} onChange={() => setChunkStrategy('section')} className="accent-blue-600" />
                          <span className="text-sm text-slate-700">By Section <span className="text-slate-400 text-xs font-normal ml-0.5">(e.g. ITEM 1, §3)</span></span>
                        </label>
                      </div>
                      {singleDocText.trim().length > 0 && (
                        <div className="text-xs text-slate-500">
                          {chunkSingleDocument(singleDocText, chunkStrategy).length} segments detected
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {parsedPreview.length > 0 && (
                  <div className="border-t border-slate-200 pt-4 animate-fadeIn">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data Preview ({parsedPreview.length} Items)</h4>
                      <div className="flex items-center gap-2">
                        {parsedPreview.some(p => p.group) && (
                          <span className="text-xs text-purple-600 font-medium bg-purple-100 px-2 py-0.5 rounded-full">
                            Groups Detected
                          </span>
                        )}
                        <span className="text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full">Valid</span>
                      </div>
                    </div>

                    {/* Preprocessing report — only shown for CSV uploads */}
                    {preprocessReport && preprocessReport.droppedRows.length > 0 && (
                      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                        <div className="font-semibold text-amber-800 mb-1">
                          Preprocessing: {preprocessReport.keptRows} of {preprocessReport.totalRows} rows kept
                        </div>
                        <div className="text-amber-700 space-y-0.5">
                          {(() => {
                            const counts = preprocessReport.droppedRows.reduce<Record<string, number>>((acc, r) => {
                              acc[r.reason] = (acc[r.reason] ?? 0) + 1;
                              return acc;
                            }, {});
                            return Object.entries(counts).map(([reason, count]) => (
                              <div key={reason}>
                                • {count} row{count > 1 ? 's' : ''} removed — {
                                  reason === 'missing_value' ? 'empty or null value (NA, blank, "no response", etc.)' :
                                    reason === 'too_short' ? 'too short to be meaningful (<10 characters)' :
                                      reason === 'no_content' ? 'no meaningful content (numbers only, repeated characters, punctuation)' :
                                        reason === 'duplicate_id' ? 'duplicate ID (renamed and kept)' : reason
                                }
                              </div>
                            ));
                          })()}
                          {preprocessReport.multiColumnsMerged && (
                            <div>• Multiple question columns detected and merged into one response per participant</div>
                          )}
                          {preprocessReport.bomStripped && (
                            <div>• UTF-8 BOM (Excel encoding marker) removed</div>
                          )}
                          {preprocessReport.separatorDetected !== ',' && (
                            <div>• {preprocessReport.separatorDetected === ';' ? 'Semicolon' : 'Tab'}-separated file detected and parsed correctly</div>
                          )}
                        </div>
                      </div>
                    )}
                    {preprocessReport && preprocessReport.droppedRows.length === 0 && (
                      <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                        All {preprocessReport.totalRows} rows passed quality checks — no rows removed.
                        {preprocessReport.multiColumnsMerged && ' Multiple question columns merged into one response per participant.'}
                      </div>
                    )}
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <div className="max-h-48 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                            <tr>
                              <th className="px-3 py-2 w-24">ID</th>
                              <th className="px-3 py-2">Text</th>
                              {parsedPreview.some(p => p.group) && (
                                <th className="px-3 py-2 w-28">Group</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-600">
                            {currentItems.map((row, i) => (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.id}</td>
                                <td className="px-3 py-2 truncate max-w-md">{row.text}</td>
                                {parsedPreview.some(p => p.group) && (
                                  <td className="px-3 py-2">
                                    {row.group && (
                                      <span className={`px-2 py-0.5 text-xs rounded-full ${row.group === 'community' ? 'bg-blue-100 text-blue-700' :
                                        row.group === 'expert' ? 'bg-emerald-100 text-emerald-700' :
                                          row.group === 'youth' ? 'bg-amber-100 text-amber-700' :
                                            row.group === 'government' ? 'bg-purple-100 text-purple-700' :
                                              row.group === 'business' ? 'bg-rose-100 text-rose-700' :
                                                'bg-slate-100 text-slate-600'
                                        }`}>
                                        {row.group}
                                      </span>
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="bg-slate-50 px-3 py-2 border-t border-slate-100 flex items-center justify-between">
                          <div className="text-xs text-slate-500">
                            Page {previewPage} of {totalPages}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPreviewPage(Math.max(1, previewPage - 1))}
                              disabled={previewPage === 1}
                              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50"
                            >
                              Prev
                            </button>
                            <button
                              onClick={() => setPreviewPage(Math.min(totalPages, previewPage + 1))}
                              disabled={previewPage === totalPages}
                              className="px-2 py-1 text-xs border rounded hover:bg-white disabled:opacity-50"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Column Selector (only for CSV uploads) */}
          {step === 2 && totalSteps === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-slate-800">Select Columns</h2>
                <p className="text-slate-500 mt-2">
                  {scannedColumns[0]?.totalCount ?? 0} rows found.
                  Mark which columns to use as participant ID, text responses, and optional group.
                </p>
              </div>
              <ColumnSelector
                columns={scannedColumns}
                selection={columnSelection}
                onChange={setColumnSelection}
                mode={multiColumnMode}
                onModeChange={setMultiColumnMode}
              />
              {uploadError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{uploadError}</div>
              )}
            </div>
          )}

          {/* Step 2 (2-step flow) or Step 3 (3-step flow) — Analysis Configuration */}
          {((step === 2 && totalSteps === 2) || (step === 3 && totalSteps === 3)) && (
            <div className="space-y-8 animate-fadeIn">
              <div className="flex justify-between items-center">
                <div className="text-left">
                  <h2 className="text-2xl font-bold text-slate-800">Analysis Settings</h2>
                  <p className="text-slate-500 mt-2">Configure AI Provider and Summary Strategy.</p>
                </div>

                {/* Combined Status Indicator */}
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 border ${currentStatus === 'connected' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  <div className={`w-2 h-2 rounded-full ${currentStatus === 'connected' ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                  {currentStatus === 'connected'
                    ? `${providerLabel} connection verified`
                    : currentStatus === 'checking' ? `Checking ${providerLabel}…` : `${providerLabel} unavailable`}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="project-name" className="block text-sm font-semibold text-slate-700 mb-2">Project Name</label>
                  <input
                    id="project-name"
                    type="text"
                    value={config.datasetName}
                    onChange={(e) => setConfig({ ...config, datasetName: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                  />
                </div>

                <div>
                  <div className="flex items-end justify-between mb-1">
                    <label htmlFor="domain-context" className="block text-sm font-semibold text-slate-700">Domain Context <span className="text-slate-400 font-normal">(Optional)</span></label>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Select descriptive domain context or write your own. Audit hypotheses are not silently injected into model judgments.</p>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                    {DOMAIN_PRESETS.map(preset => {
                      const isActive = config.domainContext?.includes(preset.context);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setConfig({ ...config, domainContext: preset.context })}
                          className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${isActive ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                          <div className="font-semibold mb-0.5">{preset.label}</div>
                          <div className={`text-[9px] leading-tight line-clamp-2 ${isActive ? 'text-blue-600/80' : 'text-slate-400'}`}>{preset.biasHint}</div>
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    id="domain-context"
                    value={config.domainContext || ''}
                    onChange={(e) => setConfig({ ...config, domainContext: e.target.value })}
                    rows={2}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm text-slate-700 placeholder:text-slate-400 resize-y"
                    placeholder="e.g. &quot;These are witness depositions from a civil law case&quot; or &quot;Quarterly earnings call transcripts from tech companies&quot;"
                  />
                </div>

                {/* Provider Selection — data destination is part of the scientific execution manifest. */}
                <fieldset>
                  <legend className="block text-sm font-semibold text-slate-700">Model provider and data destination</legend>
                  <p className="mb-3 mt-1 text-xs text-slate-500">Cloud providers receive participant text for generation/evaluation. Ollama stays on the configured host only when that host is local or organization-controlled.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Row 1 */}
                  <button type="button"
                    onClick={() => setConfig({ ...config, aiProvider: 'gemini', evaluatorModel: config.evaluatorProvider ? config.evaluatorModel : undefined })}
                    aria-pressed={config.aiProvider === 'gemini'}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'gemini' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">☁️</div>
                      <div className="font-bold text-slate-800">Google Gemini</div>
                      {geminiStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {geminiStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">Third-party cloud · usage limits and retention depend on your Google plan.</p>
                  </button>

                  <button type="button"
                    onClick={() => setConfig({ ...config, aiProvider: 'groq', evaluatorModel: config.evaluatorProvider ? config.evaluatorModel : undefined })}
                    aria-pressed={config.aiProvider === 'groq'}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'groq' ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">⚡</div>
                      <div className="font-bold text-slate-800">Groq</div>
                      {groqStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                    </div>
                    <p className="text-xs text-slate-500">Third-party cloud · available models and pricing come from your Groq account.</p>
                  </button>

                  <button type="button"
                    onClick={() => setConfig({ ...config, aiProvider: 'ollama', evaluatorModel: config.evaluatorProvider ? config.evaluatorModel : undefined })}
                    aria-pressed={config.aiProvider === 'ollama'}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'ollama' ? 'border-violet-500 bg-violet-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">💻</div>
                      <div className="font-bold text-slate-800">Local Ollama</div>
                      {ollamaStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {ollamaStatus === 'offline' && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Not connected</span>}
                    </div>
                    <p className="text-xs text-slate-500">Local/organization host · privacy depends on the configured host.</p>
                  </button>

                  {/* Row 2 */}
                  <button type="button"
                    onClick={() => setConfig({ ...config, aiProvider: 'openai', evaluatorModel: config.evaluatorProvider ? config.evaluatorModel : undefined })}
                    aria-pressed={config.aiProvider === 'openai'}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'openai' ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">🤖</div>
                      <div className="font-bold text-slate-800">OpenAI</div>
                      {openAIStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {openAIStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">Third-party cloud · live catalog is filtered to compatible text models.</p>
                  </button>

                  <button type="button"
                    onClick={() => setConfig({ ...config, aiProvider: 'claude', evaluatorModel: config.evaluatorProvider ? config.evaluatorModel : undefined })}
                    aria-pressed={config.aiProvider === 'claude'}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'claude' ? 'border-orange-500 bg-orange-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">🧠</div>
                      <div className="font-bold text-slate-800">Claude</div>
                      {claudeStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {claudeStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">Third-party cloud · completion only; select embeddings separately.</p>
                  </button>

                  <button type="button"
                    onClick={() => setConfig({ ...config, aiProvider: 'apertus', evaluatorModel: config.evaluatorProvider ? config.evaluatorModel : undefined })}
                    aria-pressed={config.aiProvider === 'apertus'}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'apertus' ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">🇨🇭</div>
                      <div className="font-bold text-slate-800">Apertus</div>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">Swiss AI</span>
                      {apertusStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {apertusStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">Apertus open weights hosted by PublicAI cloud · live authenticated model catalog.</p>
                  </button>
                </div>
                </fieldset>

                {/* API Key inputs — always visible when provider is selected; stored only in sessionStorage */}
                {providerIsUsed('gemini') && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="gemini-api-key" className="text-sm font-semibold text-blue-800">
                        Gemini API Key
                      </label>
                      {geminiStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          {geminiKeyInput ? '✓ Browser key active' : '✓ From environment'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-blue-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="gemini-api-key"
                        type="password"
                        value={geminiKeyInput}
                        onChange={(e) => handleGeminiKeyChange(e.target.value)}
                        placeholder={geminiStatus === 'connected' && !geminiKeyInput ? 'Key loaded from environment' : 'AIza…'}
                        className="flex-1 p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      />
                      {geminiStatus === 'checking' && (
                        <span className="self-center text-xs text-slate-400">checking…</span>
                      )}
                    </div>
                    <p className="text-xs text-blue-600 mt-1.5">
                      <a className="underline" href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noreferrer">Google API-key documentation</a>. A browser-entered key is exposed to this page's JavaScript and extensions; use a restricted research key, not a production secret.
                    </p>
                  </div>
                )}

                {providerIsUsed('groq') && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="groq-api-key" className="text-sm font-semibold text-emerald-800">
                        Groq API Key
                      </label>
                      {groqStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          {isGroqKeyFromEnv() ? '✓ From environment' : '✓ Browser key active'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="groq-api-key"
                        type="password"
                        value={groqKeyInput}
                        onChange={(e) => handleGroqKeyChange(e.target.value)}
                        placeholder={isGroqKeyFromEnv() ? 'Key loaded from environment' : 'gsk_…'}
                        className="flex-1 p-2.5 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>
                    <p className="text-xs text-emerald-600 mt-1.5">
                      <a className="underline" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq API keys</a>. The key remains in this tab's session storage but is accessible to page JavaScript and extensions.
                    </p>
                  </div>
                )}

                {providerIsUsed('openai') && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="openai-api-key" className="text-sm font-semibold text-teal-800">OpenAI API Key</label>
                      {openAIStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Active</span>
                      ) : (
                        <span className="text-[10px] text-teal-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <input
                      id="openai-api-key"
                      type="password"
                      value={openAIKeyInput}
                      onChange={(e) => handleOpenAIKeyChange(e.target.value)}
                      placeholder="sk-…"
                      className="w-full p-2.5 border border-teal-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                    />
                    <p className="text-xs text-teal-600 mt-1.5">
                      <a className="underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI API keys</a>. OpenAI advises against deploying secret keys in browser applications; use this BYOK mode only in a trusted research session.
                    </p>
                  </div>
                )}

                {providerIsUsed('claude') && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="claude-api-key" className="text-sm font-semibold text-orange-800">Anthropic API Key</label>
                      {claudeStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Active</span>
                      ) : (
                        <span className="text-[10px] text-orange-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <input
                      id="claude-api-key"
                      type="password"
                      value={claudeKeyInput}
                      onChange={(e) => handleClaudeKeyChange(e.target.value)}
                      placeholder="sk-ant-…"
                      className="w-full p-2.5 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                    />
                    <p className="text-xs text-orange-600 mt-1.5">
                      <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic API keys</a>. Direct-browser access exposes the key to page JavaScript; Claude has no embeddings endpoint, so embeddings are configured separately.
                    </p>
                  </div>
                )}

                {providerIsUsed('apertus') && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="apertus-api-key" className="text-sm font-semibold text-red-800">🇨🇭 PublicAI Key (hosted Apertus)</label>
                      {apertusStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Active</span>
                      ) : (
                        <span className="text-[10px] text-red-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <input
                      id="apertus-api-key"
                      type="password"
                      value={apertusKeyInput}
                      onChange={(e) => handleApertusKeyChange(e.target.value)}
                      placeholder="pai-…"
                      className="w-full p-2.5 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white"
                    />
                    <p className="text-xs text-red-600 mt-1.5">
                      Apertus is an open-weight Swiss model hosted here through PublicAI. Local development uses the Vite relay. The public static demonstration has no PublicAI relay, so this option is unavailable there. <a className="underline" href="https://platform.publicai.co/docs" target="_blank" rel="noreferrer">PublicAI API documentation</a>.
                    </p>
                  </div>
                )}

                {providerIsUsed('ollama') && (
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="ollama-host" className="text-sm font-semibold text-violet-800">Ollama Host URL</label>
                      {ollamaStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Connected</span>
                      ) : (
                        <span className="text-[10px] text-violet-500">Leave blank for local dev (auto-proxied)</span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="ollama-host"
                        type="url"
                        value={ollamaHostInput}
                        onChange={(e) => handleOllamaHostInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleOllamaHostTest();
                          }
                        }}
                        placeholder="http://localhost:11434"
                        className="min-w-0 flex-1 p-2.5 border border-violet-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleOllamaHostTest}
                        disabled={ollamaStatus === 'checking'}
                        className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-wait disabled:opacity-60"
                      >
                        {ollamaStatus === 'checking' ? 'Testing…' : 'Test connection'}
                      </button>
                    </div>
                    {ollamaConnectionMessage && (
                      <p role="status" className={`mt-2 text-xs ${ollamaStatus === 'connected' ? 'text-green-700' : ollamaStatus === 'checking' ? 'text-violet-700' : 'text-amber-800'}`}>
                        {ollamaConnectionMessage}
                      </p>
                    )}
                    <p className="text-xs text-violet-600 mt-1.5">
                      <strong>Local dev:</strong> Leave blank — Vite auto-proxies to localhost:11434.<br />
                      <strong>Hosted app:</strong> localhost means the computer running this browser. If Ollama runs elsewhere, use a local SSH tunnel or an authenticated HTTPS reverse proxy. Allow only <code>https://sachit27.github.io</code> in Ollama's browser-origin configuration. Do not expose Ollama through a public unauthenticated tunnel.
                    </p>
                  </div>
                )}

                {/* Summary Method Selection */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Summary Generation Method</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, summaryMethod: 'ai', summaryProvenance: { origin: 'generated-in-run' } })}
                      disabled={currentStatus !== 'connected'}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${config.summaryMethod === 'ai' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'} ${currentStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex justify-between">
                        <span className={`font-bold ${config.summaryMethod === 'ai' ? 'text-blue-700' : 'text-slate-700'}`}>AI Model</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Generative Summary</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, summaryMethod: 'extractive', summaryProvenance: { origin: 'algorithmic-extractive' } })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${config.summaryMethod === 'extractive' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className={`font-bold ${config.summaryMethod === 'extractive' ? 'text-blue-700' : 'text-slate-700'}`}>Extractive (NLP)</div>
                      <div className="text-xs text-slate-500 mt-1">Algorithmic selection</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, summaryMethod: 'manual', summaryProvenance: { origin: 'unknown' } })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${config.summaryMethod === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className={`font-bold ${config.summaryMethod === 'manual' ? 'text-blue-700' : 'text-slate-700'}`}>Manual Input</div>
                      <div className="text-xs text-slate-500 mt-1">Paste your own</div>
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Summary author</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">
                        {config.summaryMethod === 'ai' ? `${providerLabel} / ${config.model}` : config.summaryMethod === 'extractive' ? 'Deterministic extractive algorithm' : 'User-declared external/manual text'}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="evaluator-provider" className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Automated audit evaluator</label>
                      <select
                        id="evaluator-provider"
                        value={evaluatorProvider}
                        onChange={(event) => {
                          const provider = event.target.value as AIProvider;
                          const models = modelsForProvider(provider);
                          setConfig({
                            ...config,
                            evaluatorProvider: provider === config.aiProvider ? undefined : provider,
                            evaluatorModel: provider === config.aiProvider ? undefined : models[0],
                          });
                        }}
                        className="mt-1 w-full rounded border border-indigo-200 bg-white p-2 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="groq">Groq</option>
                        <option value="ollama">Ollama</option>
                        <option value="openai">OpenAI</option>
                        <option value="claude">Claude</option>
                        <option value="apertus">Apertus / PublicAI</option>
                      </select>
                      <select
                        id="evaluator-model"
                        value={config.evaluatorModel ?? ''}
                        onChange={(event) => setConfig({ ...config, evaluatorModel: event.target.value || undefined })}
                        className="mt-1 w-full rounded border border-indigo-200 bg-white p-2 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500"
                      >
                        {evaluatorProvider === config.aiProvider && <option value="">Same as generator ({config.model})</option>}
                        {evaluatorModels.filter(model => evaluatorProvider !== config.aiProvider || model !== config.model).map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                      <div className={`mt-1 text-[10px] ${evaluatorStatus === 'connected' ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {labelForProvider(evaluatorProvider)} {evaluatorStatus === 'connected' ? 'connection verified' : 'not verified; model-coded audits will be unavailable'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Semantic representation</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{config.embeddingProvider} / {config.embeddingModel}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-[10px] leading-relaxed text-indigo-900/70">
                    {config.evaluatorProvider && config.evaluatorProvider !== config.aiProvider
                      ? `A different provider (${labelForProvider(evaluatorProvider)}) will perform model-coded transformation, affect, claim, tension, graph, and rhetoric checks. Participant text is sent to both configured providers.`
                      : config.evaluatorModel
                      ? 'A different same-provider model will perform model-coded transformation, affect, claim, tension, graph, and rhetoric checks. This reduces direct self-review but is still automated and provider-dependent.'
                      : config.summaryMethod === 'ai'
                        ? 'The configured summary model will also judge the automated audit modules. This same-model self-review is less independent; choose another listed evaluator model when available.'
                        : 'The primary configured model will judge the automated audit modules. It did not author this summary, but the audit remains automated and provider-dependent.'}
                    {evaluatorStatus !== 'connected' && ' The evaluator provider is not verified, so model-coded enrichments will remain unavailable; deterministic semantic analysis can still run.'}
                  </p>
                </div>

                {/* AI Configuration */}
                {config.summaryMethod === 'ai' && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Strategy
                        </label>
                        <select
                          value={config.strategy}
                          onChange={(e) => setConfig({ ...config, strategy: e.target.value as any })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                          <option value="balanced">Balanced evidence (default)</option>
                          <option value="diversity">Diverse-perspective emphasis</option>
                          <option value="consensus">Shared-theme emphasis</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Word Limit <span className="text-slate-400 font-normal">(optional)</span>
                        </label>
                        <input
                          type="number"
                          min={50}
                          step={50}
                          placeholder="No limit — auto-scales"
                          value={config.wordLimit || ''}
                          onChange={(e) => setConfig({ ...config, wordLimit: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        />
                      </div>

                      {/* Gemini Specifics */}
                      {config.aiProvider === 'gemini' && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Gemini Model</label>
                          {geminiModels.generation.length > 0 ? (
                            <select
                              value={config.model}
                              onChange={(e) => setConfig({ ...config, model: e.target.value })}
                              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                              {geminiModels.generation.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={config.model}
                              onChange={(e) => setConfig({ ...config, model: e.target.value })}
                              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                              placeholder={DEFAULT_GEMINI_GENERATION_MODEL}
                            />
                          )}
                          <div className="text-[10px] text-slate-400 mt-1">Embedding: {bgeM3Status === 'connected' ? 'BGE-M3 (active)' : config.embeddingModel}</div>
                        </div>
                      )}

                      {/* Ollama Specifics */}
                      {config.aiProvider === 'ollama' && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Local Generation Model</label>
                          {ollamaCompletionModels.length > 0 ? (
                            <select
                              value={config.model}
                              onChange={(e) => setConfig({ ...config, model: e.target.value })}
                              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                              {ollamaCompletionModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-sm text-red-500 italic p-2 bg-red-50 rounded border border-red-100">
                              No models found. Check Ollama.
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-1">
                            Embedding: {bgeM3Status === 'connected'
                              ? <b>BGE-M3 (active)</b>
                              : <><b>{config.embeddingModel}</b> ({config.embeddingProvider})</>}
                          </div>
                        </div>
                      )}

                      {/* Groq Specifics */}
                      {config.aiProvider === 'groq' && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-700">Groq Model</label>
                            <button
                              onClick={refreshGroqModels}
                              disabled={isFetchingModels === 'groq'}
                              className="text-[10px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1 disabled:opacity-40"
                              title="Fetch live model list from Groq API"
                            >
                              {isFetchingModels === 'groq' ? '⏳ Fetching...' : '↻ Refresh'}
                            </button>
                          </div>
                          <select
                            value={config.model}
                            onChange={(e) => setConfig({ ...config, model: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                          >
                            {groqModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* OpenAI Specifics */}
                      {config.aiProvider === 'openai' && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-700">OpenAI Model</label>
                            <button
                              onClick={refreshOpenAIModels}
                              disabled={isFetchingModels === 'openai'}
                              className="text-[10px] text-teal-600 hover:text-teal-700 flex items-center gap-1 disabled:opacity-40"
                              title="Fetch live model list from OpenAI API"
                            >
                              {isFetchingModels === 'openai' ? '⏳ Fetching...' : '↻ Refresh'}
                            </button>
                          </div>
                          <select
                            value={config.model}
                            onChange={(e) => setConfig({ ...config, model: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                          >
                            {openAIModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Claude Specifics */}
                      {config.aiProvider === 'claude' && (
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <label className="block text-sm font-semibold text-slate-700">Claude Model</label>
                            <button
                              type="button"
                              onClick={refreshClaudeModels}
                              disabled={isFetchingModels === 'claude'}
                              className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-700 disabled:opacity-40"
                              title="Fetch the authenticated account's live model catalog from Anthropic"
                            >
                              {isFetchingModels === 'claude' ? '⏳ Fetching…' : '↻ Refresh'}
                            </button>
                          </div>
                          <select
                            value={config.model}
                            onChange={(e) => setConfig({ ...config, model: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                          >
                            {claudeModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Live account catalog when authenticated. Embedding: {bgeM3Status === 'connected' ? <b>BGE-M3 (active)</b> : 'TF-IDF (Claude has no embeddings API)'}
                          </div>
                        </div>
                      )}

                      {/* Apertus Specifics */}
                      {config.aiProvider === 'apertus' && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Apertus Model</label>
                          <select
                            value={config.model}
                            onChange={(e) => setConfig({ ...config, model: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white"
                          >
                            {apertusModels.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          {(() => {
                            const info = apertusModelInfo.find(item => item.id === config.model);
                            if (!info) return null;
                            return (
                              <div className="mt-1 text-[10px] text-slate-500">
                                {info.contextLength ? `Context limit: ${info.contextLength.toLocaleString()} tokens.` : 'Context limit not reported.'}
                                {(info.inputPrice !== undefined || info.outputPrice !== undefined) && ` Catalog input/output price: ${info.inputPrice ?? 'n/a'} / ${info.outputPrice ?? 'n/a'} (provider-defined units; verify before running).`}
                              </div>
                            );
                          })()}
                          <div className="text-[10px] text-slate-400 mt-1">
                            Embedding: {bgeM3Status === 'connected' ? <b>BGE-M3 (active)</b> : 'TF-IDF (Apertus has no embeddings API)'}
                          </div>
                        </div>
                      )}


                      {/* ── Embedding Model Selector (always shown) ── */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-semibold text-slate-700">Embedding Model</label>
                          <span className="text-[10px] text-slate-400 italic">Independent of completion model</span>
                        </div>
                        <select
                          value={`${config.embeddingProvider}::${config.embeddingModel}`}
                          onChange={(e) => {
                            const [provider, model] = e.target.value.split('::') as [any, string];
                            setConfig(prev => ({ ...prev, embeddingProvider: provider, embeddingModel: model }));
                          }}
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none bg-white text-sm"
                        >
                          {/* BGE-M3 – only shown if detected */}
                          {bgeM3Status === 'connected' && (
                            <option value="bge-m3::bge-m3">BGE-M3 (local service · multilingual dense)</option>
                          )}
                          {/* OpenAI embeddings – shown if key is set */}
                          {(openAIStatus === 'connected') && (
                            <optgroup label="OpenAI Embeddings">
                              {OPENAI_EMBEDDING_MODELS.map(m => (
                                <option key={m} value={`openai::${m}`}>{m}</option>
                              ))}
                            </optgroup>
                          )}
                          {/* Gemini embeddings – shown if key is set */}
                          {(geminiStatus === 'connected') && (
                            <optgroup label="Gemini Embeddings">
                              {geminiModels.embedding.length > 0
                                ? geminiModels.embedding.map(m => (
                                  <option key={m} value={`gemini::${m}`}>{m}</option>
                                ))
                                : <option value={`gemini::${DEFAULT_GEMINI_EMBEDDING_MODEL}`}>{DEFAULT_GEMINI_EMBEDDING_MODEL}</option>
                              }
                            </optgroup>
                          )}
                          {/* Ollama embeddings – shown if connected */}
                          {(ollamaStatus === 'connected' && ollamaEmbeddingModels.length > 0) && (
                            <optgroup label="Ollama Embeddings">
                              {ollamaEmbeddingModels.map(m => (
                                <option key={m} value={`ollama::${m}`}>{m}</option>
                              ))}
                            </optgroup>
                          )}
                          {/* TF-IDF – always available */}
                          <option value="tfidf::tfidf">TF-IDF (local · no API needed)</option>
                        </select>
                        <div className="text-[10px] text-slate-400 mt-1.5">
                          {config.embeddingProvider === 'bge-m3' && 'Local multilingual dense embedding service; validate for your language and domain'}
                          {config.embeddingProvider === 'openai' && `OpenAI API · model: ${config.embeddingModel}`}
                          {config.embeddingProvider === 'gemini' && `Gemini API · model: ${config.embeddingModel}`}
                          {config.embeddingProvider === 'ollama' && `Local Ollama · model: ${config.embeddingModel}`}
                          {config.embeddingProvider === 'tfidf' && 'Bag-of-words fallback — no API cost, lower quality'}
                        </div>

                        {/* BGE-M3 status indicator */}
                        <div className={`mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg text-xs border ${bgeM3Status === 'connected'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : bgeM3Status === 'checking'
                            ? 'bg-amber-50 border-amber-200 text-amber-600'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>
                          <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${bgeM3Status === 'connected' ? 'bg-emerald-500' :
                            bgeM3Status === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'
                            }`} />
                          <div>
                            {bgeM3Status === 'connected' && (
                              <span>BGE-M3 server <b>active</b> — available in embedding dropdown above</span>
                            )}
                            {bgeM3Status === 'checking' && (
                              <span>Checking BGE-M3 server…</span>
                            )}
                            {bgeM3Status === 'offline' && (
                              <div>
                                <span>BGE-M3 server <b>offline</b></span>
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-blue-500 hover:text-blue-600 font-medium">How to start BGE-M3</summary>
                                  <div className="mt-1.5 text-[10px] text-slate-500 space-y-1">
                                    <p>Run the BGE-M3 embedding server locally:</p>
                                    <code className="block bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-mono">
                                      pip install -r requirements-embedding.txt<br />
                                      python embedding_server.py
                                    </code>
                                    <p className="text-slate-400">Or use Docker:</p>
                                    <code className="block bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-mono">
                                      docker compose up bge-m3
                                    </code>
                                    <p className="text-slate-400 mt-1">Once running, refresh this page — it auto-detects on port 5001.</p>
                                  </div>
                                </details>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {config.summaryMethod !== 'ai' && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="non-ai-embedding-model" className="text-sm font-semibold text-slate-700">Embedding model for the semantic audit</label>
                      <span className="text-[10px] text-slate-500">Independent of summary origin</span>
                    </div>
                    <select
                      id="non-ai-embedding-model"
                      value={`${config.embeddingProvider}::${config.embeddingModel}`}
                      onChange={(event) => {
                        const [provider, model] = event.target.value.split('::') as [AnalysisConfig['embeddingProvider'], string];
                        setConfig(previous => ({ ...previous, embeddingProvider: provider, embeddingModel: model }));
                      }}
                      className="mt-2 w-full rounded-lg border border-violet-200 bg-white p-2.5 text-sm focus:ring-2 focus:ring-violet-500"
                    >
                      {bgeM3Status === 'connected' && <option value="bge-m3::bge-m3">BGE-M3 (local service · multilingual dense)</option>}
                      {openAIStatus === 'connected' && OPENAI_EMBEDDING_MODELS.map(model => <option key={model} value={`openai::${model}`}>OpenAI / {model}</option>)}
                      {geminiStatus === 'connected' && (geminiModels.embedding.length > 0 ? geminiModels.embedding : [DEFAULT_GEMINI_EMBEDDING_MODEL]).map(model => <option key={model} value={`gemini::${model}`}>Gemini / {model}</option>)}
                      {ollamaStatus === 'connected' && ollamaEmbeddingModels.map(model => <option key={model} value={`ollama::${model}`}>Ollama / {model}</option>)}
                      <option value="tfidf::tfidf">TF-IDF (local baseline · no API)</option>
                    </select>
                    <p className="mt-2 text-[10px] text-slate-500">Sparse TF-IDF and dense embeddings have different score distributions; the run records the actual method and uses tier-specific provisional display bands.</p>
                  </div>
                )}

                {/* Manual Summary Input */}
                {config.summaryMethod === 'manual' && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                    <label htmlFor="manual-summary" className="block text-sm font-semibold text-slate-700 mb-2">
                      Manual Summary Text
                    </label>
                    <textarea
                      id="manual-summary"
                      value={config.manualSummaryText || ''}
                      onChange={(e) => setConfig({ ...config, manualSummaryText: e.target.value })}
                      className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                      placeholder="Paste the existing summary here for provenance analysis..."
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      The tool will generate embeddings for this text to compare against participant inputs.
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label htmlFor="summary-origin" className="block text-sm font-semibold text-slate-700 mb-1">Declared summary origin</label>
                        <select
                          id="summary-origin"
                          value={config.summaryProvenance?.origin ?? 'unknown'}
                          onChange={(event) => setConfig({
                            ...config,
                            summaryProvenance: { ...config.summaryProvenance, origin: event.target.value as any },
                          })}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
                        >
                          <option value="unknown">Unknown / not documented</option>
                          <option value="human-authored">Human-authored</option>
                          <option value="ai-generated-external">AI-generated outside this run</option>
                          <option value="ai-assisted">AI-assisted, human edited</option>
                          <option value="mixed">Mixed authorship</option>
                        </select>
                      </div>
                      {(config.summaryProvenance?.origin === 'ai-generated-external' || config.summaryProvenance?.origin === 'ai-assisted' || config.summaryProvenance?.origin === 'mixed') && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label htmlFor="summary-source-provider" className="block text-xs font-semibold text-slate-600 mb-1">Original provider</label>
                            <input id="summary-source-provider" type="text" value={config.summaryProvenance.provider ?? ''} onChange={(event) => setConfig({ ...config, summaryProvenance: { ...config.summaryProvenance!, provider: event.target.value } })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm" placeholder="If known" />
                          </div>
                          <div>
                            <label htmlFor="summary-source-model" className="block text-xs font-semibold text-slate-600 mb-1">Exact original model</label>
                            <input id="summary-source-model" type="text" value={config.summaryProvenance.model ?? ''} onChange={(event) => setConfig({ ...config, summaryProvenance: { ...config.summaryProvenance!, model: event.target.value } })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm" placeholder="If known" />
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-amber-700">This declaration is recorded as supplied; the tool does not infer or authenticate missing origin information.</p>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={persistEmbeddings}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setPersistEmbeddings(enabled);
                          setPersistentEmbeddingCacheEnabled(enabled);
                          setCacheCleared(false);
                        }}
                        className="mt-0.5 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">Persist derived embeddings for 7 days</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                          Off by default. Embeddings can retain information about participant text. When enabled, they stay in this browser's IndexedDB under SHA-256 identities; raw text is not stored in the cache.
                        </span>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        clearEmbeddingCache();
                        setCacheCleared(true);
                      }}
                      className="whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      {cacheCleared ? 'Cleared' : 'Clear cache'}
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 hover:border-slate-300 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={config.runLOO}
                        onChange={(e) => setConfig({ ...config, runLOO: e.target.checked })}
                        className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Compute semantic-centroid sensitivity</div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Deterministically removes each embedding in turn; no summaries are regenerated and no extra model calls are made.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Strategy Comparison Option */}
                <div className="p-4 rounded-lg border border-indigo-200 bg-indigo-50/50 hover:border-indigo-300 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={config.runStrategyComparison || false}
                        onChange={(e) => setConfig({ ...config, runStrategyComparison: e.target.checked })}
                        disabled={config.summaryMethod !== 'ai' || currentStatus !== 'connected'}
                        className="w-5 h-5 text-indigo-600 rounded border-indigo-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${config.summaryMethod === 'ai' ? 'text-slate-800' : 'text-slate-400'}`}>
                        Compare Strategies
                        <span className="ml-2 text-[10px] bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded-full uppercase font-bold">New</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Run all 3 strategies (Balanced, Diversity, Consensus) and compare results side-by-side.
                        <span className="text-amber-600 font-medium ml-1">Takes ~3x longer.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-6 flex justify-between items-center border-t border-slate-200">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className={`px-4 py-2 font-medium rounded-lg transition-colors ${step === 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'}`}
          >
            Back
          </button>

          <button
            onClick={() => step < totalSteps ? handleNext() : handleRunClick()}
            disabled={
              (step === 1 && inputType === 'upload' && scannedColumns.length === 0 && inputs.length === 0) ||
              (step === 1 && inputType !== 'upload' && inputs.length === 0) ||
              (step === 2 && totalSteps === 3 && columnSelection.textColumnIndices.length === 0) ||
              (step === totalSteps && config.summaryMethod === 'manual' && !config.manualSummaryText)
            }
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 flex items-center gap-2"
          >
            {step < totalSteps ? 'Next Step' : (
              <>
                <span>Run Analysis</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
