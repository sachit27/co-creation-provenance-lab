import React, { useState, useEffect } from 'react';
import { AnalysisConfig, ParticipantInput, StakeholderGroup, ColumnInfo, ColumnSelection, MultiColumnMode } from '../../types';
import { SAMPLE_DATA, SAMPLE_DATASETS, ANALYSIS_CONFIG } from '../../constants';
import { checkAIConnection, getGeminiModels, setRuntimeGeminiKey } from '../../services/gemini';
import { checkOllamaConnection, getOllamaModels, setOllamaHost, getOllamaHostUrl, isUsingViteProxy } from '../../services/ollama';
import { checkBgeM3Connection, resetBgeM3Cache } from '../../services/bgeM3';
import { checkGroqConnection, setGroqApiKey, getGroqApiKey, isGroqKeyFromEnv, GROQ_FREE_MODELS, fetchGroqModels } from '../../services/groq';
import { checkOpenAIConnection, setOpenAIApiKey, getOpenAIApiKey, OPENAI_CHAT_MODELS, OPENAI_EMBEDDING_MODELS, fetchOpenAIChatModels } from '../../services/openai';
import { checkClaudeConnection, setClaudeApiKey, getClaudeApiKey, CLAUDE_MODELS } from '../../services/claude';
import { checkApertusConnection, setApertusApiKey, getApertusApiKey, APERTUS_MODELS } from '../../services/apertus';
import { preprocessCSV, scanColumns, preprocessWithSelections, PreprocessReport, PreprocessResult } from '../../services/dataPreprocessor';
import { ColumnSelector } from './ColumnSelector';

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

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ onRun }) => {
  const [step, setStep] = useState<number>(1);
  const [inputs, setInputs] = useState<ParticipantInput[]>([]);
  const [inputType, setInputType] = useState<'sample' | 'paste' | 'upload'>('sample');
  const [selectedDataset, setSelectedDataset] = useState<string>('citizen');
  const [rawText, setRawText] = useState('');

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
  const [groqStatus, setGroqStatus] = useState<'connected' | 'offline'>('offline');
  const [openAIStatus, setOpenAIStatus] = useState<'connected' | 'offline'>('offline');
  const [claudeStatus, setClaudeStatus] = useState<'connected' | 'offline'>('offline');
  const [apertusStatus, setApertusStatus] = useState<'connected' | 'offline'>('offline');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [geminiModels, setGeminiModels] = useState<{ generation: string[]; embedding: string[] }>({ generation: [], embedding: [] });
  const [openAIModels, setOpenAIModels] = useState<string[]>(OPENAI_CHAT_MODELS);
  const [groqModels, setGroqModels] = useState<string[]>(GROQ_FREE_MODELS);
  const [isFetchingModels, setIsFetchingModels] = useState<'openai' | 'groq' | null>(null);
  const [bgeM3Status, setBgeM3Status] = useState<'checking' | 'connected' | 'offline'>('checking');
  // API key inputs — values are written to sessionStorage, never to a server
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [groqKeyInput, setGroqKeyInput] = useState(() => getGroqApiKey());
  const [openAIKeyInput, setOpenAIKeyInput] = useState(() => getOpenAIApiKey());
  const [claudeKeyInput, setClaudeKeyInput] = useState(() => getClaudeApiKey());
  const [apertusKeyInput, setApertusKeyInput] = useState(() => getApertusApiKey());
  // Ollama host URL (for Vercel deployments)
  const [ollamaHostInput, setOllamaHostInput] = useState(() => isUsingViteProxy() ? '' : getOllamaHostUrl());

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
        : checkClaudeConnection() ? CLAUDE_MODELS[0]
          : checkApertusConnection() ? APERTUS_MODELS[0]
            : 'gemini-2.0-flash',
    embeddingModel: checkOpenAIConnection() ? 'text-embedding-3-small' : 'text-embedding-004',
    embeddingProvider: checkOpenAIConnection() ? 'openai' : 'gemini',
    runLOO: false,
    summaryMethod: 'ai',
    manualSummaryText: ''
  });

  // Helper: fetch live models for a provider and update state
  const refreshOpenAIModels = async () => {
    setIsFetchingModels('openai');
    try {
      const models = await fetchOpenAIChatModels();
      setOpenAIModels(models);
      setConfig(prev => ({ ...prev, model: models[0] || OPENAI_CHAT_MODELS[0] }));
    } finally {
      setIsFetchingModels(null);
    }
  };

  const refreshGroqModels = async () => {
    setIsFetchingModels('groq');
    try {
      const models = await fetchGroqModels();
      setGroqModels(models);
      setConfig(prev => ({ ...prev, model: models[0] || GROQ_FREE_MODELS[0] }));
    } finally {
      setIsFetchingModels(null);
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
          const defaultGen = models.generation.find(m => m.includes('gemini-2.0-flash')) || models.generation[0];
          const defaultEmbed = models.embedding.find(m => m.includes('text-embedding-004')) || models.embedding[0] || 'text-embedding-004';
          setConfig(prev => ({ ...prev, model: defaultGen, embeddingModel: defaultEmbed }));
        }
      }
    });
    checkOllamaConnection().then(async connected => {
      setOllamaStatus(connected ? 'connected' : 'offline');
      if (connected) {
        const models = await getOllamaModels();
        setOllamaModels(models);
        if (models.length > 0 && !models.includes(config.model) && config.aiProvider === 'ollama') {
          const defaultModel = models.find(m => m.includes('qwen') || m.includes('llama') || m.includes('gpt')) || models[0];
          setConfig(prev => ({ ...prev, model: defaultModel }));
        }
      }
    });
    // Groq (key already in sessionStorage from previous session)
    const alreadyHasGroqKey = checkGroqConnection();
    setGroqStatus(alreadyHasGroqKey ? 'connected' : 'offline');
    // OpenAI
    setOpenAIStatus(checkOpenAIConnection() ? 'connected' : 'offline');
    // Claude
    setClaudeStatus(checkClaudeConnection() ? 'connected' : 'offline');
    // Apertus
    setApertusStatus(checkApertusConnection() ? 'connected' : 'offline');
    // BGE-M3 check (independent — used for embeddings regardless of provider)
    resetBgeM3Cache();
    checkBgeM3Connection().then(connected => setBgeM3Status(connected ? 'connected' : 'offline'));
  }, []);

  // Auto-detect the best available embedding provider in priority order.
  // This is used as the default so non-expert users always get optimal quality.
  // Experts can still override via the Embedding Model dropdown.
  const getBestEmbeddingConfig = (): { embeddingProvider: AnalysisConfig['embeddingProvider']; embeddingModel: string } => {
    if (bgeM3Status === 'connected') return { embeddingProvider: 'bge-m3', embeddingModel: 'bge-m3' };
    if (openAIStatus === 'connected') return { embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small' };
    if (geminiStatus === 'connected') return { embeddingProvider: 'gemini', embeddingModel: 'text-embedding-004' };
    if (ollamaStatus === 'connected' && ollamaModels.length > 0) {
      const embModel = ollamaModels.find(m => m.includes('minilm') || m.includes('embed')) || ollamaModels[0];
      return { embeddingProvider: 'ollama', embeddingModel: embModel };
    }
    return { embeddingProvider: 'tfidf', embeddingModel: 'tfidf' };
  };

  // Update defaults when switching provider
  useEffect(() => {
    const bestEmb = getBestEmbeddingConfig();

    if (config.aiProvider === 'ollama') {
      const defaultGen = ollamaModels.find(m => m.includes('qwen') || m.includes('llama')) || ollamaModels[0] || 'qwen3:30b-instruct';
      setConfig(prev => ({ ...prev, model: defaultGen, ...bestEmb }));
    } else if (config.aiProvider === 'groq') {
      setConfig(prev => ({ ...prev, model: groqModels[0] || GROQ_FREE_MODELS[0], ...bestEmb }));
    } else if (config.aiProvider === 'openai') {
      setConfig(prev => ({ ...prev, model: openAIModels[0] || OPENAI_CHAT_MODELS[0], ...bestEmb }));
    } else if (config.aiProvider === 'claude') {
      setConfig(prev => ({ ...prev, model: CLAUDE_MODELS[0], ...bestEmb }));
    } else if (config.aiProvider === 'apertus') {
      setConfig(prev => ({ ...prev, model: APERTUS_MODELS[0], ...bestEmb }));
    } else {
      const defaultGen = geminiModels.generation.find(m => m.includes('gemini-2.0-flash')) || geminiModels.generation[0] || 'gemini-2.0-flash';
      setConfig(prev => ({ ...prev, model: defaultGen, ...bestEmb }));
    }
  }, [config.aiProvider, ollamaModels, geminiModels, openAIModels, groqModels, bgeM3Status, openAIStatus, geminiStatus, ollamaStatus]);

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
    } else {
      // Upload mode reset if needed
      if (inputs.length === 0) setParsedPreview([]);
    }
  }, [inputType, rawText, selectedDataset]);

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
      .filter(t => t.length > 5)
      .map((line, i) => {
        // Support "ID, Text" or "ID, Text, Group" format in paste
        const parts = parseCSVRow(line);
        if (parts.length >= 2 && parts[0].length < 20 && parts[0].length > 0) {
          const result: ParticipantInput = {
            id: parts[0],
            text: parts[1]
          };
          if (parts.length >= 3 && parts[2]) {
            result.group = parseGroup(parts[2]);
          }
          return result;
        }
        return { id: `P_${i + 1}`, text: line };
      });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setColumnMapping(null);
    setPreprocessReport(null);
    setScannedColumns([]);
    setRawCsvText('');
    setInputs([]);
    setParsedPreview([]);
    setColumnSelection({ idColumnIndex: -1, textColumnIndices: [], groupColumnIndex: -1 });

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv') && !file.name.endsWith('.tsv') && !file.name.endsWith('.txt')) {
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
      }
    });
  };

  // Handle Groq key entry — fetch live models after key is set
  const handleGroqKeyChange = (key: string) => {
    setGroqKeyInput(key);
    setGroqApiKey(key);
    const connected = checkGroqConnection();
    setGroqStatus(connected ? 'connected' : 'offline');
    if (connected && key.trim().length > 5) refreshGroqModels();
  };

  // Handle OpenAI key entry — fetch live models after key is set
  const handleOpenAIKeyChange = (key: string) => {
    setOpenAIKeyInput(key);
    setOpenAIApiKey(key);
    const connected = checkOpenAIConnection();
    setOpenAIStatus(connected ? 'connected' : 'offline');
    if (connected && key.trim().length > 5) refreshOpenAIModels();
  };

  // Handle Claude key entry
  const handleClaudeKeyChange = (key: string) => {
    setClaudeKeyInput(key);
    setClaudeApiKey(key);
    setClaudeStatus(checkClaudeConnection() ? 'connected' : 'offline');
  };

  // Handle Apertus key entry
  const handleApertusKeyChange = (key: string) => {
    setApertusKeyInput(key);
    setApertusApiKey(key);
    setApertusStatus(checkApertusConnection() ? 'connected' : 'offline');
  };

  // Handle Ollama host URL change (fixes Vercel "Inactive" bug)
  const handleOllamaHostChange = (host: string) => {
    setOllamaHostInput(host);
    setOllamaHost(host);
    setOllamaStatus('checking');
    checkOllamaConnection().then(async connected => {
      setOllamaStatus(connected ? 'connected' : 'offline');
      if (connected) {
        const models = await getOllamaModels();
        setOllamaModels(models);
      }
    });
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'sample', icon: '📊', label: 'Sample Data', desc: 'Pre-loaded citizen science dataset' },
                  { id: 'paste', icon: '✍️', label: 'Paste Text', desc: 'Direct input with CSV support' },
                  { id: 'upload', icon: '📂', label: 'Upload CSV', desc: 'Columns: id, text' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setInputType(opt.id as any);
                      if (opt.id === 'paste' && inputs.length === 0) setRawText('');
                    }}
                    className={`p-6 rounded-xl border-2 text-left transition-all duration-200 group ${inputType === opt.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{opt.icon}</div>
                    <div className={`font-bold ${inputType === opt.id ? 'text-blue-700' : 'text-slate-700'}`}>{opt.label}</div>
                    <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
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
                          <option key={key} value={key}>{ds.label} — {ds.data.length} inputs (Gini {ds.expectedGini})</option>
                        ))}
                      </select>
                      <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-green-200 bg-green-50/50 rounded-lg">
                        <div className="text-green-600 font-bold mb-1">Dataset Loaded</div>
                        <div className="text-slate-600 font-medium text-sm">{SAMPLE_DATASETS[selectedDataset]?.label || 'Citizen Science'}</div>
                        <div className="text-slate-400 text-xs mt-1">{SAMPLE_DATASETS[selectedDataset]?.description}</div>
                      </div>
                    </div>
                  )}
                  {inputType === 'paste' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Paste Contributions (One per line)</label>
                      <textarea
                        className="w-full h-40 p-4 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700 placeholder:text-slate-400 font-mono"
                        placeholder="User_01, The app crashes often...&#10;User_02, I need better tools..."
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                      />
                      <p className="text-xs text-slate-500 mt-2">Supported formats: Simple lines or "ID, Content" CSV style.</p>
                    </div>
                  )}
                  {inputType === 'upload' && (
                    <div className="space-y-3">
                      <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-300 rounded-lg hover:bg-white transition-colors relative group">
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileUpload}
                          className="absolute opacity-0 w-full h-full cursor-pointer z-10"
                        />
                        <div className="text-4xl mb-3 text-slate-300 group-hover:text-blue-400 transition-colors">📄</div>
                        <span className="text-sm font-medium text-slate-600">Click to browse or drag CSV file</span>
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
                    ? `${config.aiProvider === 'gemini' ? 'Gemini' : config.aiProvider === 'groq' ? 'Groq' : 'Ollama'} Online`
                    : 'Service Unavailable (Offline Mode)'}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Project Name</label>
                  <input
                    type="text"
                    value={config.datasetName}
                    onChange={(e) => setConfig({ ...config, datasetName: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                  />
                </div>

                {/* Provider Selection — 2 rows: 3 + 3 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Row 1 */}
                  <div
                    onClick={() => setConfig({ ...config, aiProvider: 'gemini' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'gemini' ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">☁️</div>
                      <div className="font-bold text-slate-800">Google Gemini</div>
                      {geminiStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {geminiStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">Cloud-based. Free tier at <strong>ai.google.dev</strong>.</p>
                  </div>

                  <div
                    onClick={() => setConfig({ ...config, aiProvider: 'groq' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'groq' ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">⚡</div>
                      <div className="font-bold text-slate-800">Groq</div>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">FREE</span>
                      {groqStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                    </div>
                    <p className="text-xs text-slate-500">Ultra-fast Llama 3. Free at <strong>console.groq.com</strong>.</p>
                  </div>

                  <div
                    onClick={() => setConfig({ ...config, aiProvider: 'ollama' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'ollama' ? 'border-violet-500 bg-violet-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">💻</div>
                      <div className="font-bold text-slate-800">Local Ollama</div>
                      {ollamaStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {ollamaStatus === 'offline' && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Offline</span>}
                    </div>
                    <p className="text-xs text-slate-500">100% local, privacy-first. Requires <code>ollama serve</code>.</p>
                  </div>

                  {/* Row 2 */}
                  <div
                    onClick={() => setConfig({ ...config, aiProvider: 'openai' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'openai' ? 'border-teal-500 bg-teal-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">🤖</div>
                      <div className="font-bold text-slate-800">OpenAI</div>
                      {openAIStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {openAIStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">GPT-4o & embeddings. At <strong>platform.openai.com</strong>.</p>
                  </div>

                  <div
                    onClick={() => setConfig({ ...config, aiProvider: 'claude' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'claude' ? 'border-orange-500 bg-orange-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">🧠</div>
                      <div className="font-bold text-slate-800">Claude</div>
                      {claudeStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {claudeStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">Anthropic Claude 3.5. At <strong>console.anthropic.com</strong>.</p>
                  </div>

                  <div
                    onClick={() => setConfig({ ...config, aiProvider: 'apertus' })}
                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${config.aiProvider === 'apertus' ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <div className="text-xl">🇨🇭</div>
                      <div className="font-bold text-slate-800">Apertus</div>
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">Swiss AI</span>
                      {apertusStatus === 'connected' && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                      {apertusStatus === 'offline' && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">No key</span>}
                    </div>
                    <p className="text-xs text-slate-500">ETH/EPFL open-source, 1800+ languages. Via <strong>publicai.co</strong>.</p>
                  </div>
                </div>

                {/* API Key inputs — always visible when provider is selected; stored only in sessionStorage */}
                {config.aiProvider === 'gemini' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-blue-800">
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
                      Get a free key at <strong>ai.google.dev</strong> → Get API key (takes ~30 sec)
                    </p>
                  </div>
                )}

                {config.aiProvider === 'groq' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-emerald-800">
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
                        type="password"
                        value={groqKeyInput}
                        onChange={(e) => handleGroqKeyChange(e.target.value)}
                        placeholder={isGroqKeyFromEnv() ? 'Key loaded from environment' : 'gsk_…'}
                        className="flex-1 p-2.5 border border-emerald-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>
                    <p className="text-xs text-emerald-600 mt-1.5">
                      Free key (no credit card) at <strong>console.groq.com</strong> → API Keys → Create key
                    </p>
                  </div>
                )}

                {config.aiProvider === 'openai' && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-teal-800">OpenAI API Key</label>
                      {openAIStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Active</span>
                      ) : (
                        <span className="text-[10px] text-teal-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={openAIKeyInput}
                      onChange={(e) => handleOpenAIKeyChange(e.target.value)}
                      placeholder="sk-…"
                      className="w-full p-2.5 border border-teal-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                    />
                    <p className="text-xs text-teal-600 mt-1.5">
                      Get a key at <strong>platform.openai.com/api-keys</strong>. Paid service.
                    </p>
                  </div>
                )}

                {config.aiProvider === 'claude' && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-orange-800">Anthropic API Key</label>
                      {claudeStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Active</span>
                      ) : (
                        <span className="text-[10px] text-orange-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={claudeKeyInput}
                      onChange={(e) => handleClaudeKeyChange(e.target.value)}
                      placeholder="sk-ant-…"
                      className="w-full p-2.5 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                    />
                    <p className="text-xs text-orange-600 mt-1.5">
                      Get a key at <strong>console.anthropic.com/keys</strong>. Note: Claude has no embeddings endpoint — BGE-M3/TF-IDF used instead.
                    </p>
                  </div>
                )}

                {config.aiProvider === 'apertus' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-red-800">🇨🇭 PublicAI Key (Apertus)</label>
                      {apertusStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Active</span>
                      ) : (
                        <span className="text-[10px] text-red-500">stored only in this browser tab</span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={apertusKeyInput}
                      onChange={(e) => handleApertusKeyChange(e.target.value)}
                      placeholder="pai-…"
                      className="w-full p-2.5 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none bg-white"
                    />
                    <p className="text-xs text-red-600 mt-1.5">
                      Apertus is open-source Swiss AI by ETH/EPFL/CSCS, 1800+ languages. Get a free key at <strong>publicai.co</strong>.
                    </p>
                  </div>
                )}

                {config.aiProvider === 'ollama' && (
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 animate-fadeIn">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-semibold text-violet-800">Ollama Host URL</label>
                      {ollamaStatus === 'connected' ? (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Connected</span>
                      ) : (
                        <span className="text-[10px] text-violet-500">Leave blank for local dev (auto-proxied)</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={ollamaHostInput}
                      onChange={(e) => handleOllamaHostChange(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="w-full p-2.5 border border-violet-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white font-mono"
                    />
                    <p className="text-xs text-violet-600 mt-1.5">
                      <strong>Local dev:</strong> Leave blank — Vite auto-proxies to localhost:11434.<br />
                      <strong>Vercel/cloud:</strong> Enter your Ollama URL directly. Requires <code>OLLAMA_ORIGINS="*" ollama serve</code> (or use a Cloudflare Tunnel).
                    </p>
                  </div>
                )}

                {/* Summary Method Selection */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-3">Summary Generation Method</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button
                      onClick={() => setConfig({ ...config, summaryMethod: 'ai' })}
                      disabled={currentStatus !== 'connected'}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${config.summaryMethod === 'ai' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'} ${currentStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex justify-between">
                        <span className={`font-bold ${config.summaryMethod === 'ai' ? 'text-blue-700' : 'text-slate-700'}`}>AI Model</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Generative Summary</div>
                    </button>

                    <button
                      onClick={() => setConfig({ ...config, summaryMethod: 'extractive' })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${config.summaryMethod === 'extractive' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className={`font-bold ${config.summaryMethod === 'extractive' ? 'text-blue-700' : 'text-slate-700'}`}>Extractive (NLP)</div>
                      <div className="text-xs text-slate-500 mt-1">Algorithmic selection</div>
                    </button>

                    <button
                      onClick={() => setConfig({ ...config, summaryMethod: 'manual' })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${config.summaryMethod === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                    >
                      <div className={`font-bold ${config.summaryMethod === 'manual' ? 'text-blue-700' : 'text-slate-700'}`}>Manual Input</div>
                      <div className="text-xs text-slate-500 mt-1">Paste your own</div>
                    </button>
                  </div>
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
                          <option value="balanced">⚖️ Balanced (Standard)</option>
                          <option value="diversity">🌈 Diversity Focus (Minorities)</option>
                          <option value="consensus">🤝 Consensus Focus (Agreements)</option>
                        </select>
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
                              placeholder="gemini-2.0-flash"
                            />
                          )}
                          <div className="text-[10px] text-slate-400 mt-1">Embedding: {bgeM3Status === 'connected' ? 'BGE-M3 (active)' : config.embeddingModel}</div>
                        </div>
                      )}

                      {/* Ollama Specifics */}
                      {config.aiProvider === 'ollama' && (
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Local Generation Model</label>
                          {ollamaModels.length > 0 ? (
                            <select
                              value={config.model}
                              onChange={(e) => setConfig({ ...config, model: e.target.value })}
                              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                              {ollamaModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-sm text-red-500 italic p-2 bg-red-50 rounded border border-red-100">
                              No models found. Check Ollama.
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-1">
                            Embedding: {bgeM3Status === 'connected' ? <b>BGE-M3 (active)</b> : <><b>all-minilm:latest</b> (Auto-selected)</>}
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
                          <label className="block text-sm font-semibold text-slate-700 mb-2">Claude Model</label>
                          <select
                            value={config.model}
                            onChange={(e) => setConfig({ ...config, model: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                          >
                            {CLAUDE_MODELS.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Embedding: {bgeM3Status === 'connected' ? <b>BGE-M3 (active)</b> : 'TF-IDF (Claude has no embeddings API)'}
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
                            {APERTUS_MODELS.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
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
                            <option value="bge-m3::bge-m3">⭐ BGE-M3 (local · state-of-the-art)</option>
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
                                : <option value="gemini::text-embedding-004">text-embedding-004</option>
                              }
                            </optgroup>
                          )}
                          {/* Ollama embeddings – shown if connected */}
                          {(ollamaStatus === 'connected' && ollamaModels.length > 0) && (
                            <optgroup label="Ollama Embeddings">
                              {ollamaModels.map(m => (
                                <option key={m} value={`ollama::${m}`}>{m}</option>
                              ))}
                            </optgroup>
                          )}
                          {/* TF-IDF – always available */}
                          <option value="tfidf::tfidf">TF-IDF (local · no API needed)</option>
                        </select>
                        <div className="text-[10px] text-slate-400 mt-1.5">
                          {config.embeddingProvider === 'bge-m3' && '✓ Local multilingual transformer — best quality'}
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
                                      docker run -p 8787:8787 semitechnologies/transformers-inference:baai-bge-m3
                                    </code>
                                    <p className="text-slate-400">Or without Docker (Python):</p>
                                    <code className="block bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] font-mono">
                                      pip install sentence-transformers flask<br />
                                      python bge_m3_server.py
                                    </code>
                                    <p className="text-slate-400 mt-1">Once running, refresh this page — it auto-detects on port 8787.</p>
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

                {/* Manual Summary Input */}
                {config.summaryMethod === 'manual' && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-fadeIn">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Manual Summary Text
                    </label>
                    <textarea
                      value={config.manualSummaryText || ''}
                      onChange={(e) => setConfig({ ...config, manualSummaryText: e.target.value })}
                      className="w-full h-32 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                      placeholder="Paste the existing summary here for provenance analysis..."
                    />
                    <p className="text-xs text-slate-500 mt-2">
                      The tool will generate embeddings for this text to compare against participant inputs.
                    </p>
                  </div>
                )}

                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 hover:border-slate-300 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={config.runLOO}
                        onChange={(e) => setConfig({ ...config, runLOO: e.target.checked })}
                        disabled={config.summaryMethod !== 'ai' || currentStatus !== 'connected'}
                        className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${config.summaryMethod === 'ai' ? 'text-slate-800' : 'text-slate-400'}`}>Enable Sensitivity Analysis (Leave-One-Out)</div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Regenerates summary multiple times.
                        {config.aiProvider === 'ollama' && <span className="text-amber-600 font-bold ml-1">Warning: Very slow on local CPU.</span>}
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
