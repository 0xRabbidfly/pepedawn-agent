// src/index.ts
import { logger as logger11 } from "@elizaos/core";

// src/service.ts
import {
  createUniqueUuid,
  logger as logger6,
  MemoryType as MemoryType2,
  ModelType as ModelType2,
  Semaphore,
  Service,
  splitChunks as splitChunks2
} from "@elizaos/core";

// src/document-processor.ts
import {
  MemoryType,
  ModelType,
  logger as logger4,
  splitChunks
} from "@elizaos/core";

// node_modules/uuid/dist/esm/regex.js
var regex_default = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

// node_modules/uuid/dist/esm/validate.js
function validate(uuid) {
  return typeof uuid === "string" && regex_default.test(uuid);
}
var validate_default = validate;

// node_modules/uuid/dist/esm/parse.js
function parse(uuid) {
  if (!validate_default(uuid)) {
    throw TypeError("Invalid UUID");
  }
  let v;
  return Uint8Array.of((v = parseInt(uuid.slice(0, 8), 16)) >>> 24, v >>> 16 & 255, v >>> 8 & 255, v & 255, (v = parseInt(uuid.slice(9, 13), 16)) >>> 8, v & 255, (v = parseInt(uuid.slice(14, 18), 16)) >>> 8, v & 255, (v = parseInt(uuid.slice(19, 23), 16)) >>> 8, v & 255, (v = parseInt(uuid.slice(24, 36), 16)) / 1099511627776 & 255, v / 4294967296 & 255, v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255);
}
var parse_default = parse;

// node_modules/uuid/dist/esm/stringify.js
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

// node_modules/uuid/dist/esm/rng.js
import { randomFillSync } from "crypto";
var rnds8Pool = new Uint8Array(256);
var poolPtr = rnds8Pool.length;
function rng() {
  if (poolPtr > rnds8Pool.length - 16) {
    randomFillSync(rnds8Pool);
    poolPtr = 0;
  }
  return rnds8Pool.slice(poolPtr, poolPtr += 16);
}

// node_modules/uuid/dist/esm/v35.js
function stringToBytes(str) {
  str = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; ++i) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}
var DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
var URL2 = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
function v35(version, hash, value, namespace, buf, offset) {
  const valueBytes = typeof value === "string" ? stringToBytes(value) : value;
  const namespaceBytes = typeof namespace === "string" ? parse_default(namespace) : namespace;
  if (typeof namespace === "string") {
    namespace = parse_default(namespace);
  }
  if (namespace?.length !== 16) {
    throw TypeError("Namespace must be array-like (16 iterable integer values, 0-255)");
  }
  let bytes = new Uint8Array(16 + valueBytes.length);
  bytes.set(namespaceBytes);
  bytes.set(valueBytes, namespaceBytes.length);
  bytes = hash(bytes);
  bytes[6] = bytes[6] & 15 | version;
  bytes[8] = bytes[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = bytes[i];
    }
    return buf;
  }
  return unsafeStringify(bytes);
}

// node_modules/uuid/dist/esm/native.js
import { randomUUID } from "crypto";
var native_default = { randomUUID };

// node_modules/uuid/dist/esm/v4.js
function v4(options, buf, offset) {
  if (native_default.randomUUID && !buf && !options) {
    return native_default.randomUUID();
  }
  options = options || {};
  const rnds = options.random ?? options.rng?.() ?? rng();
  if (rnds.length < 16) {
    throw new Error("Random bytes length must be >= 16");
  }
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    if (offset < 0 || offset + 16 > buf.length) {
      throw new RangeError(`UUID byte range ${offset}:${offset + 15} is out of buffer bounds`);
    }
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
var v4_default = v4;

// node_modules/uuid/dist/esm/sha1.js
import { createHash } from "crypto";
function sha1(bytes) {
  if (Array.isArray(bytes)) {
    bytes = Buffer.from(bytes);
  } else if (typeof bytes === "string") {
    bytes = Buffer.from(bytes, "utf8");
  }
  return createHash("sha1").update(bytes).digest();
}
var sha1_default = sha1;

// node_modules/uuid/dist/esm/v5.js
function v5(value, namespace, buf, offset) {
  return v35(80, sha1_default, value, namespace, buf, offset);
}
v5.DNS = DNS;
v5.URL = URL2;
var v5_default = v5;

// src/types.ts
import z from "zod";
var ModelConfigSchema = z.object({
  // Provider configuration
  // NOTE: If EMBEDDING_PROVIDER is not specified, the plugin automatically assumes
  // plugin-openai is being used and will use OPENAI_EMBEDDING_MODEL and
  // OPENAI_EMBEDDING_DIMENSIONS for configuration
  EMBEDDING_PROVIDER: z.enum(["openai", "google"]).optional(),
  TEXT_PROVIDER: z.enum(["openai", "anthropic", "openrouter", "google"]).optional(),
  // API keys
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  // Base URLs (optional for most providers)
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().optional(),
  GOOGLE_BASE_URL: z.string().optional(),
  // Model names
  TEXT_EMBEDDING_MODEL: z.string(),
  TEXT_MODEL: z.string().optional(),
  // Token limits
  MAX_INPUT_TOKENS: z.string().or(z.number()).transform((val) => typeof val === "string" ? parseInt(val, 10) : val),
  MAX_OUTPUT_TOKENS: z.string().or(z.number()).optional().transform((val) => val ? typeof val === "string" ? parseInt(val, 10) : val : 4096),
  // Embedding dimension
  // For OpenAI: Only applies to text-embedding-3-small and text-embedding-3-large models
  // Default: 1536 dimensions
  EMBEDDING_DIMENSION: z.string().or(z.number()).optional().transform((val) => val ? typeof val === "string" ? parseInt(val, 10) : val : 1536),
  // config setting
  LOAD_DOCS_ON_STARTUP: z.boolean().default(false),
  // Contextual Knowledge settings
  CTX_KNOWLEDGE_ENABLED: z.boolean().default(false)
});
var KnowledgeServiceType = {
  KNOWLEDGE: "knowledge"
};

// src/config.ts
import z2 from "zod";
import { logger } from "@elizaos/core";
var parseBooleanEnv = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};
function validateModelConfig(runtime) {
  try {
    const getSetting = (key, defaultValue) => {
      if (runtime) {
        return runtime.getSetting(key) || process.env[key] || defaultValue;
      }
      return process.env[key] || defaultValue;
    };
    const ctxKnowledgeEnabled = parseBooleanEnv(getSetting("CTX_KNOWLEDGE_ENABLED", "false"));
    logger.debug(
      `[Document Processor] CTX_KNOWLEDGE_ENABLED: '${ctxKnowledgeEnabled} (runtime: ${!!runtime})`
    );
    const embeddingProvider = getSetting("EMBEDDING_PROVIDER");
    const assumePluginOpenAI = !embeddingProvider;
    if (assumePluginOpenAI) {
      const openaiApiKey2 = getSetting("OPENAI_API_KEY");
      const openaiEmbeddingModel = getSetting("OPENAI_EMBEDDING_MODEL");
      if (openaiApiKey2 && openaiEmbeddingModel) {
        logger.debug(
          "[Document Processor] EMBEDDING_PROVIDER not specified, using configuration from plugin-openai"
        );
      } else {
        logger.debug(
          "[Document Processor] EMBEDDING_PROVIDER not specified. Assuming embeddings are provided by another plugin (e.g., plugin-google-genai)."
        );
      }
    }
    const finalEmbeddingProvider = embeddingProvider;
    const textEmbeddingModel = getSetting("TEXT_EMBEDDING_MODEL") || getSetting("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
    const embeddingDimension = getSetting("EMBEDDING_DIMENSION") || getSetting("OPENAI_EMBEDDING_DIMENSIONS") || "1536";
    const openaiApiKey = getSetting("OPENAI_API_KEY");
    const config = ModelConfigSchema.parse({
      EMBEDDING_PROVIDER: finalEmbeddingProvider,
      TEXT_PROVIDER: getSetting("TEXT_PROVIDER"),
      OPENAI_API_KEY: openaiApiKey,
      ANTHROPIC_API_KEY: getSetting("ANTHROPIC_API_KEY"),
      OPENROUTER_API_KEY: getSetting("OPENROUTER_API_KEY"),
      GOOGLE_API_KEY: getSetting("GOOGLE_API_KEY"),
      OPENAI_BASE_URL: getSetting("OPENAI_BASE_URL"),
      ANTHROPIC_BASE_URL: getSetting("ANTHROPIC_BASE_URL"),
      OPENROUTER_BASE_URL: getSetting("OPENROUTER_BASE_URL"),
      GOOGLE_BASE_URL: getSetting("GOOGLE_BASE_URL"),
      TEXT_EMBEDDING_MODEL: textEmbeddingModel,
      TEXT_MODEL: getSetting("TEXT_MODEL"),
      MAX_INPUT_TOKENS: getSetting("MAX_INPUT_TOKENS", "4000"),
      MAX_OUTPUT_TOKENS: getSetting("MAX_OUTPUT_TOKENS", "4096"),
      EMBEDDING_DIMENSION: embeddingDimension,
      LOAD_DOCS_ON_STARTUP: parseBooleanEnv(getSetting("LOAD_DOCS_ON_STARTUP")),
      CTX_KNOWLEDGE_ENABLED: ctxKnowledgeEnabled
    });
    validateConfigRequirements(config, assumePluginOpenAI);
    return config;
  } catch (error) {
    if (error instanceof z2.ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
      throw new Error(`Model configuration validation failed: ${issues}`);
    }
    throw error;
  }
}
function validateConfigRequirements(config, assumePluginOpenAI) {
  const embeddingProvider = config.EMBEDDING_PROVIDER;
  if (embeddingProvider === "openai" && !config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER is set to "openai"');
  }
  if (embeddingProvider === "google" && !config.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is required when EMBEDDING_PROVIDER is set to "google"');
  }
  if (!embeddingProvider) {
    logger.debug(
      "[Document Processor] No EMBEDDING_PROVIDER specified. Embeddings will be handled by the runtime."
    );
  }
  if (assumePluginOpenAI && config.OPENAI_API_KEY && !config.TEXT_EMBEDDING_MODEL) {
    throw new Error("OPENAI_EMBEDDING_MODEL is required when using plugin-openai configuration");
  }
  if (config.CTX_KNOWLEDGE_ENABLED) {
    logger.debug("[Document Processor] CTX validation: Checking text generation settings...");
    if (config.TEXT_PROVIDER === "openai" && !config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when TEXT_PROVIDER is set to "openai"');
    }
    if (config.TEXT_PROVIDER === "anthropic" && !config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required when TEXT_PROVIDER is set to "anthropic"');
    }
    if (config.TEXT_PROVIDER === "openrouter" && !config.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is required when TEXT_PROVIDER is set to "openrouter"');
    }
    if (config.TEXT_PROVIDER === "google" && !config.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is required when TEXT_PROVIDER is set to "google"');
    }
    if (config.TEXT_PROVIDER === "openrouter") {
      const modelName = config.TEXT_MODEL?.toLowerCase() || "";
      if (modelName.includes("claude") || modelName.includes("gemini")) {
        logger.debug(
          `[Document Processor] Using ${modelName} with OpenRouter. This configuration supports document caching for improved performance.`
        );
      }
    }
  } else {
    logger.info("[Document Processor] Contextual Knowledge is DISABLED!");
    logger.info("[Document Processor] This means documents will NOT be enriched with context.");
    if (assumePluginOpenAI) {
      logger.info(
        "[Document Processor] Embeddings will be handled by the runtime (e.g., plugin-openai, plugin-google-genai)."
      );
    } else {
      logger.info(
        "[Document Processor] Using configured embedding provider for basic embeddings only."
      );
    }
  }
}
async function getProviderRateLimits(runtime) {
  const config = validateModelConfig(runtime);
  const getSetting = (key, defaultValue) => {
    if (runtime) {
      return runtime.getSetting(key) || defaultValue;
    }
    return process.env[key] || defaultValue;
  };
  const maxConcurrentRequests = parseInt(getSetting("MAX_CONCURRENT_REQUESTS", "30"), 10);
  const requestsPerMinute = parseInt(getSetting("REQUESTS_PER_MINUTE", "60"), 10);
  const tokensPerMinute = parseInt(getSetting("TOKENS_PER_MINUTE", "150000"), 10);
  const primaryProvider = config.TEXT_PROVIDER || config.EMBEDDING_PROVIDER;
  logger.debug(
    `[Document Processor] Rate limiting for ${primaryProvider}: ${requestsPerMinute} RPM, ${tokensPerMinute} TPM, ${maxConcurrentRequests} concurrent`
  );
  switch (primaryProvider) {
    case "anthropic":
      return {
        maxConcurrentRequests,
        requestsPerMinute,
        tokensPerMinute,
        provider: "anthropic"
      };
    case "openai":
      return {
        maxConcurrentRequests,
        requestsPerMinute: Math.min(requestsPerMinute, 3e3),
        tokensPerMinute: Math.min(tokensPerMinute, 15e4),
        provider: "openai"
      };
    case "google":
      return {
        maxConcurrentRequests,
        requestsPerMinute: Math.min(requestsPerMinute, 60),
        tokensPerMinute: Math.min(tokensPerMinute, 1e5),
        provider: "google"
      };
    default:
      return {
        maxConcurrentRequests,
        requestsPerMinute,
        tokensPerMinute,
        provider: primaryProvider || "unknown"
      };
  }
}

// src/ctx-embeddings.ts
var DEFAULT_CHUNK_TOKEN_SIZE = 500;
var DEFAULT_CHUNK_OVERLAP_TOKENS = 100;
var DEFAULT_CHARS_PER_TOKEN = 3.5;
var CONTEXT_TARGETS = {
  DEFAULT: {
    MIN_TOKENS: 60,
    MAX_TOKENS: 120
  },
  PDF: {
    MIN_TOKENS: 80,
    MAX_TOKENS: 150
  },
  MATH_PDF: {
    MIN_TOKENS: 100,
    MAX_TOKENS: 180
  },
  CODE: {
    MIN_TOKENS: 100,
    MAX_TOKENS: 200
  },
  TECHNICAL: {
    MIN_TOKENS: 80,
    MAX_TOKENS: 160
  }
};
var SYSTEM_PROMPTS = {
  DEFAULT: "You are a precision text augmentation tool. Your task is to expand a given text chunk with its direct context from a larger document. You must: 1) Keep the original chunk intact; 2) Add critical context from surrounding text; 3) Never summarize or rephrase the original chunk; 4) Create contextually rich output for improved semantic retrieval.",
  CODE: "You are a precision code augmentation tool. Your task is to expand a given code chunk with necessary context from the larger codebase. You must: 1) Keep the original code chunk intact with exact syntax and indentation; 2) Add relevant imports, function signatures, or class definitions; 3) Include critical surrounding code context; 4) Create contextually rich output that maintains correct syntax.",
  PDF: "You are a precision document augmentation tool. Your task is to expand a given PDF text chunk with its direct context from the larger document. You must: 1) Keep the original chunk intact; 2) Add section headings, references, or figure captions; 3) Include text that immediately precedes and follows the chunk; 4) Create contextually rich output that maintains the document's original structure.",
  MATH_PDF: "You are a precision mathematical content augmentation tool. Your task is to expand a given mathematical text chunk with essential context. You must: 1) Keep original mathematical notations and expressions exactly as they appear; 2) Add relevant definitions, theorems, or equations from elsewhere in the document; 3) Preserve all LaTeX or mathematical formatting; 4) Create contextually rich output for improved mathematical comprehension.",
  TECHNICAL: "You are a precision technical documentation augmentation tool. Your task is to expand a technical document chunk with critical context. You must: 1) Keep the original chunk intact including all technical terminology; 2) Add relevant configuration examples, parameter definitions, or API references; 3) Include any prerequisite information; 4) Create contextually rich output that maintains technical accuracy."
};
var CONTEXTUAL_CHUNK_ENRICHMENT_PROMPT_TEMPLATE = `
<document>
{doc_content}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this chunk by adding critical surrounding context. Follow these guidelines:

1. Identify the document's main topic and key information relevant to understanding this chunk
2. Include 2-3 sentences before the chunk that provide essential context
3. Include 2-3 sentences after the chunk that complete thoughts or provide resolution
4. For technical documents, include any definitions or explanations of terms used in the chunk
5. For narrative content, include character or setting information needed to understand the chunk
6. Keep the original chunk text COMPLETELY INTACT and UNCHANGED in your response
7. Do not use phrases like "this chunk discusses" - directly present the context
8. The total length should be between {min_tokens} and {max_tokens} tokens
9. Format the response as a single coherent paragraph

Provide ONLY the enriched chunk text in your response:`;
var CACHED_CHUNK_PROMPT_TEMPLATE = `
Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this chunk by adding critical surrounding context. Follow these guidelines:

1. Identify the document's main topic and key information relevant to understanding this chunk
2. Include 2-3 sentences before the chunk that provide essential context
3. Include 2-3 sentences after the chunk that complete thoughts or provide resolution
4. For technical documents, include any definitions or explanations of terms used in the chunk
5. For narrative content, include character or setting information needed to understand the chunk
6. Keep the original chunk text COMPLETELY INTACT and UNCHANGED in your response
7. Do not use phrases like "this chunk discusses" - directly present the context
8. The total length should be between {min_tokens} and {max_tokens} tokens
9. Format the response as a single coherent paragraph

Provide ONLY the enriched chunk text in your response:`;
var CACHED_CODE_CHUNK_PROMPT_TEMPLATE = `
Here is the chunk of code we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this code chunk by adding critical surrounding context. Follow these guidelines:

1. Preserve ALL code syntax, indentation, and comments exactly as they appear
2. Include any import statements, function definitions, or class declarations that this code depends on
3. Add necessary type definitions or interfaces that are referenced in this chunk
4. Include any crucial comments from elsewhere in the document that explain this code
5. If there are key variable declarations or initializations earlier in the document, include those
6. Keep the original chunk COMPLETELY INTACT and UNCHANGED in your response
7. The total length should be between {min_tokens} and {max_tokens} tokens
8. Do NOT include implementation details for functions that are only called but not defined in this chunk

Provide ONLY the enriched code chunk in your response:`;
var CACHED_MATH_PDF_PROMPT_TEMPLATE = `
Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this chunk by adding critical surrounding context. This document contains mathematical content that requires special handling. Follow these guidelines:

1. Preserve ALL mathematical notation exactly as it appears in the chunk
2. Include any defining equations, variables, or parameters mentioned earlier in the document that relate to this chunk
3. Add section/subsection names or figure references if they help situate the chunk
4. If variables or symbols are defined elsewhere in the document, include these definitions
5. If mathematical expressions appear corrupted, try to infer their meaning from context
6. Keep the original chunk text COMPLETELY INTACT and UNCHANGED in your response
7. The total length should be between {min_tokens} and {max_tokens} tokens
8. Format the response as a coherent mathematical explanation

Provide ONLY the enriched chunk text in your response:`;
var CACHED_TECHNICAL_PROMPT_TEMPLATE = `
Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this chunk by adding critical surrounding context. This appears to be technical documentation that requires special handling. Follow these guidelines:

1. Preserve ALL technical terminology, product names, and version numbers exactly as they appear
2. Include any prerequisite information or requirements mentioned earlier in the document
3. Add section/subsection headings or navigation path to situate this chunk within the document structure
4. Include any definitions of technical terms, acronyms, or jargon used in this chunk
5. If this chunk references specific configurations, include relevant parameter explanations
6. Keep the original chunk text COMPLETELY INTACT and UNCHANGED in your response
7. The total length should be between {min_tokens} and {max_tokens} tokens
8. Format the response maintaining any hierarchical structure present in the original

Provide ONLY the enriched chunk text in your response:`;
var MATH_PDF_PROMPT_TEMPLATE = `
<document>
{doc_content}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this chunk by adding critical surrounding context. This document contains mathematical content that requires special handling. Follow these guidelines:

1. Preserve ALL mathematical notation exactly as it appears in the chunk
2. Include any defining equations, variables, or parameters mentioned earlier in the document that relate to this chunk
3. Add section/subsection names or figure references if they help situate the chunk
4. If variables or symbols are defined elsewhere in the document, include these definitions
5. If mathematical expressions appear corrupted, try to infer their meaning from context
6. Keep the original chunk text COMPLETELY INTACT and UNCHANGED in your response
7. The total length should be between {min_tokens} and {max_tokens} tokens
8. Format the response as a coherent mathematical explanation

Provide ONLY the enriched chunk text in your response:`;
var CODE_PROMPT_TEMPLATE = `
<document>
{doc_content}
</document>

Here is the chunk of code we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this code chunk by adding critical surrounding context. Follow these guidelines:

1. Preserve ALL code syntax, indentation, and comments exactly as they appear
2. Include any import statements, function definitions, or class declarations that this code depends on
3. Add necessary type definitions or interfaces that are referenced in this chunk
4. Include any crucial comments from elsewhere in the document that explain this code
5. If there are key variable declarations or initializations earlier in the document, include those
6. Keep the original chunk COMPLETELY INTACT and UNCHANGED in your response
7. The total length should be between {min_tokens} and {max_tokens} tokens
8. Do NOT include implementation details for functions that are only called but not defined in this chunk

Provide ONLY the enriched code chunk in your response:`;
var TECHNICAL_PROMPT_TEMPLATE = `
<document>
{doc_content}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk_content}
</chunk>

Create an enriched version of this chunk by adding critical surrounding context. This appears to be technical documentation that requires special handling. Follow these guidelines:

1. Preserve ALL technical terminology, product names, and version numbers exactly as they appear
2. Include any prerequisite information or requirements mentioned earlier in the document
3. Add section/subsection headings or navigation path to situate this chunk within the document structure
4. Include any definitions of technical terms, acronyms, or jargon used in this chunk
5. If this chunk references specific configurations, include relevant parameter explanations
6. Keep the original chunk text COMPLETELY INTACT and UNCHANGED in your response
7. The total length should be between {min_tokens} and {max_tokens} tokens
8. Format the response maintaining any hierarchical structure present in the original

Provide ONLY the enriched chunk text in your response:`;
function getContextualizationPrompt(docContent, chunkContent, minTokens = CONTEXT_TARGETS.DEFAULT.MIN_TOKENS, maxTokens = CONTEXT_TARGETS.DEFAULT.MAX_TOKENS, promptTemplate = CONTEXTUAL_CHUNK_ENRICHMENT_PROMPT_TEMPLATE) {
  if (!docContent || !chunkContent) {
    console.warn("Document content or chunk content is missing for contextualization.");
    return "Error: Document or chunk content missing.";
  }
  const chunkTokens = Math.ceil(chunkContent.length / DEFAULT_CHARS_PER_TOKEN);
  if (chunkTokens > maxTokens * 0.7) {
    maxTokens = Math.ceil(chunkTokens * 1.3);
    minTokens = chunkTokens;
  }
  return promptTemplate.replace("{doc_content}", docContent).replace("{chunk_content}", chunkContent).replace("{min_tokens}", minTokens.toString()).replace("{max_tokens}", maxTokens.toString());
}
function getCachingContextualizationPrompt(chunkContent, contentType, minTokens = CONTEXT_TARGETS.DEFAULT.MIN_TOKENS, maxTokens = CONTEXT_TARGETS.DEFAULT.MAX_TOKENS) {
  if (!chunkContent) {
    console.warn("Chunk content is missing for contextualization.");
    return {
      prompt: "Error: Chunk content missing.",
      systemPrompt: SYSTEM_PROMPTS.DEFAULT
    };
  }
  const chunkTokens = Math.ceil(chunkContent.length / DEFAULT_CHARS_PER_TOKEN);
  if (chunkTokens > maxTokens * 0.7) {
    maxTokens = Math.ceil(chunkTokens * 1.3);
    minTokens = chunkTokens;
  }
  let promptTemplate = CACHED_CHUNK_PROMPT_TEMPLATE;
  let systemPrompt = SYSTEM_PROMPTS.DEFAULT;
  if (contentType) {
    if (contentType.includes("javascript") || contentType.includes("typescript") || contentType.includes("python") || contentType.includes("java") || contentType.includes("c++") || contentType.includes("code")) {
      promptTemplate = CACHED_CODE_CHUNK_PROMPT_TEMPLATE;
      systemPrompt = SYSTEM_PROMPTS.CODE;
    } else if (contentType.includes("pdf")) {
      if (containsMathematicalContent(chunkContent)) {
        promptTemplate = CACHED_MATH_PDF_PROMPT_TEMPLATE;
        systemPrompt = SYSTEM_PROMPTS.MATH_PDF;
      } else {
        systemPrompt = SYSTEM_PROMPTS.PDF;
      }
    } else if (contentType.includes("markdown") || contentType.includes("text/html") || isTechnicalDocumentation(chunkContent)) {
      promptTemplate = CACHED_TECHNICAL_PROMPT_TEMPLATE;
      systemPrompt = SYSTEM_PROMPTS.TECHNICAL;
    }
  }
  const formattedPrompt = promptTemplate.replace("{chunk_content}", chunkContent).replace("{min_tokens}", minTokens.toString()).replace("{max_tokens}", maxTokens.toString());
  return {
    prompt: formattedPrompt,
    systemPrompt
  };
}
function getPromptForMimeType(mimeType, docContent, chunkContent) {
  let minTokens = CONTEXT_TARGETS.DEFAULT.MIN_TOKENS;
  let maxTokens = CONTEXT_TARGETS.DEFAULT.MAX_TOKENS;
  let promptTemplate = CONTEXTUAL_CHUNK_ENRICHMENT_PROMPT_TEMPLATE;
  if (mimeType.includes("pdf")) {
    if (containsMathematicalContent(docContent)) {
      minTokens = CONTEXT_TARGETS.MATH_PDF.MIN_TOKENS;
      maxTokens = CONTEXT_TARGETS.MATH_PDF.MAX_TOKENS;
      promptTemplate = MATH_PDF_PROMPT_TEMPLATE;
      console.debug("Using mathematical PDF prompt template");
    } else {
      minTokens = CONTEXT_TARGETS.PDF.MIN_TOKENS;
      maxTokens = CONTEXT_TARGETS.PDF.MAX_TOKENS;
      console.debug("Using standard PDF settings");
    }
  } else if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("python") || mimeType.includes("java") || mimeType.includes("c++") || mimeType.includes("code")) {
    minTokens = CONTEXT_TARGETS.CODE.MIN_TOKENS;
    maxTokens = CONTEXT_TARGETS.CODE.MAX_TOKENS;
    promptTemplate = CODE_PROMPT_TEMPLATE;
    console.debug("Using code prompt template");
  } else if (isTechnicalDocumentation(docContent) || mimeType.includes("markdown") || mimeType.includes("text/html")) {
    minTokens = CONTEXT_TARGETS.TECHNICAL.MIN_TOKENS;
    maxTokens = CONTEXT_TARGETS.TECHNICAL.MAX_TOKENS;
    promptTemplate = TECHNICAL_PROMPT_TEMPLATE;
  }
  return getContextualizationPrompt(docContent, chunkContent, minTokens, maxTokens, promptTemplate);
}
function getCachingPromptForMimeType(mimeType, chunkContent) {
  let minTokens = CONTEXT_TARGETS.DEFAULT.MIN_TOKENS;
  let maxTokens = CONTEXT_TARGETS.DEFAULT.MAX_TOKENS;
  if (mimeType.includes("pdf")) {
    if (containsMathematicalContent(chunkContent)) {
      minTokens = CONTEXT_TARGETS.MATH_PDF.MIN_TOKENS;
      maxTokens = CONTEXT_TARGETS.MATH_PDF.MAX_TOKENS;
    } else {
      minTokens = CONTEXT_TARGETS.PDF.MIN_TOKENS;
      maxTokens = CONTEXT_TARGETS.PDF.MAX_TOKENS;
    }
  } else if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("python") || mimeType.includes("java") || mimeType.includes("c++") || mimeType.includes("code")) {
    minTokens = CONTEXT_TARGETS.CODE.MIN_TOKENS;
    maxTokens = CONTEXT_TARGETS.CODE.MAX_TOKENS;
  } else if (isTechnicalDocumentation(chunkContent) || mimeType.includes("markdown") || mimeType.includes("text/html")) {
    minTokens = CONTEXT_TARGETS.TECHNICAL.MIN_TOKENS;
    maxTokens = CONTEXT_TARGETS.TECHNICAL.MAX_TOKENS;
  }
  return getCachingContextualizationPrompt(chunkContent, mimeType, minTokens, maxTokens);
}
function containsMathematicalContent(content) {
  const latexMathPatterns = [
    /\$\$.+?\$\$/s,
    // Display math: $$ ... $$
    /\$.+?\$/g,
    // Inline math: $ ... $
    /\\begin\{equation\}/,
    // LaTeX equation environment
    /\\begin\{align\}/,
    // LaTeX align environment
    /\\sum_/,
    // Summation
    /\\int/,
    // Integral
    /\\frac\{/,
    // Fraction
    /\\sqrt\{/,
    // Square root
    /\\alpha|\\beta|\\gamma|\\delta|\\theta|\\lambda|\\sigma/,
    // Greek letters
    /\\nabla|\\partial/
    // Differential operators
  ];
  const generalMathPatterns = [
    /[≠≤≥±∞∫∂∑∏√∈∉⊆⊇⊂⊃∪∩]/,
    // Mathematical symbols
    /\b[a-zA-Z]\^[0-9]/,
    // Simple exponents (e.g., x^2)
    /\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\)/,
    // Coordinates
    /\b[xyz]\s*=\s*-?\d+(\.\d+)?/,
    // Simple equations
    /\[\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\]/,
    // Vectors/matrices
    /\b\d+\s*×\s*\d+/
    // Dimensions with × symbol
  ];
  for (const pattern of latexMathPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }
  for (const pattern of generalMathPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }
  const mathKeywords = [
    "theorem",
    "lemma",
    "proof",
    "equation",
    "function",
    "derivative",
    "integral",
    "matrix",
    "vector",
    "algorithm",
    "constraint",
    "coefficient"
  ];
  const contentLower = content.toLowerCase();
  const mathKeywordCount = mathKeywords.filter((keyword) => contentLower.includes(keyword)).length;
  return mathKeywordCount >= 2;
}
function isTechnicalDocumentation(content) {
  const technicalPatterns = [
    /\b(version|v)\s*\d+\.\d+(\.\d+)?/i,
    // Version numbers
    /\b(api|sdk|cli)\b/i,
    // Technical acronyms
    /\b(http|https|ftp):\/\//i,
    // URLs
    /\b(GET|POST|PUT|DELETE)\b/,
    // HTTP methods
    /<\/?[a-z][\s\S]*>/i,
    // HTML/XML tags
    /\bREADME\b|\bCHANGELOG\b/i,
    // Common doc file names
    /\b(config|configuration)\b/i,
    // Configuration references
    /\b(parameter|param|argument|arg)\b/i
    // Parameter references
  ];
  const docHeadings = [
    /\b(Introduction|Overview|Getting Started|Installation|Usage|API Reference|Troubleshooting)\b/i
  ];
  for (const pattern of [...technicalPatterns, ...docHeadings]) {
    if (pattern.test(content)) {
      return true;
    }
  }
  const listPatterns = [
    /\d+\.\s.+\n\d+\.\s.+/,
    // Numbered lists
    /•\s.+\n•\s.+/,
    // Bullet points with •
    /\*\s.+\n\*\s.+/,
    // Bullet points with *
    /-\s.+\n-\s.+/
    // Bullet points with -
  ];
  for (const pattern of listPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
}
function getChunkWithContext(chunkContent, generatedContext) {
  if (!generatedContext || generatedContext.trim() === "") {
    console.warn("Generated context is empty. Falling back to original chunk content.");
    return chunkContent;
  }
  return generatedContext.trim();
}

// src/llm.ts
import { generateText as aiGenerateText, embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { google } from "@ai-sdk/google";
import { logger as logger2 } from "@elizaos/core";
async function generateText(runtime, prompt, system, overrideConfig) {
  const config = validateModelConfig(runtime);
  const provider = overrideConfig?.provider || config.TEXT_PROVIDER;
  const modelName = overrideConfig?.modelName || config.TEXT_MODEL;
  const maxTokens = overrideConfig?.maxTokens || config.MAX_OUTPUT_TOKENS;
  const autoCacheContextualRetrieval = overrideConfig?.autoCacheContextualRetrieval !== false;
  try {
    switch (provider) {
      case "anthropic":
        return await generateAnthropicText(config, prompt, system, modelName, maxTokens);
      case "openai":
        return await generateOpenAIText(config, prompt, system, modelName, maxTokens);
      case "openrouter":
        return await generateOpenRouterText(
          config,
          prompt,
          system,
          modelName,
          maxTokens,
          overrideConfig?.cacheDocument,
          overrideConfig?.cacheOptions,
          autoCacheContextualRetrieval
        );
      case "google":
        return await generateGoogleText(prompt, system, modelName, maxTokens, config);
      default:
        throw new Error(`Unsupported text provider: ${provider}`);
    }
  } catch (error) {
    logger2.error({ error }, `[Document Processor] ${provider} ${modelName} error`);
    throw error;
  }
}
async function generateAnthropicText(config, prompt, system, modelName, maxTokens) {
  const anthropic = createAnthropic({
    apiKey: config.ANTHROPIC_API_KEY,
    baseURL: config.ANTHROPIC_BASE_URL
  });
  const modelInstance = anthropic(modelName);
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await aiGenerateText({
        model: modelInstance,
        prompt,
        system,
        temperature: 0.3,
        maxOutputTokens: maxTokens
      });
      const totalTokens = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0);
      logger2.debug(
        `[Document Processor] ${modelName}: ${totalTokens} tokens (${result.usage.inputTokens || 0}\u2192${result.usage.outputTokens || 0})`
      );
      return result;
    } catch (error) {
      const isRateLimit = error?.status === 429 || error?.message?.includes("rate limit") || error?.message?.includes("429");
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1e3;
        logger2.warn(
          `[Document Processor] Rate limit hit (${modelName}): attempt ${attempt + 1}/${maxRetries}, retrying in ${Math.round(delay / 1e3)}s`
        );
        await new Promise((resolve2) => setTimeout(resolve2, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded for Anthropic text generation");
}
async function generateOpenAIText(config, prompt, system, modelName, maxTokens) {
  const openai = createOpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL
  });
  const modelInstance = openai.chat(modelName);
  const result = await aiGenerateText({
    model: modelInstance,
    prompt,
    system,
    temperature: 0.3,
    maxOutputTokens: maxTokens
  });
  const totalTokens = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0);
  logger2.debug(
    `[Document Processor] OpenAI ${modelName}: ${totalTokens} tokens (${result.usage.inputTokens || 0}\u2192${result.usage.outputTokens || 0})`
  );
  return result;
}
async function generateGoogleText(prompt, system, modelName, maxTokens, config) {
  const googleProvider = google;
  if (config.GOOGLE_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = config.GOOGLE_API_KEY;
  }
  const modelInstance = googleProvider(modelName);
  const result = await aiGenerateText({
    model: modelInstance,
    prompt,
    system,
    temperature: 0.3,
    maxOutputTokens: maxTokens
  });
  const totalTokens = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0);
  logger2.debug(
    `[Document Processor] Google ${modelName}: ${totalTokens} tokens (${result.usage.inputTokens || 0}\u2192${result.usage.outputTokens || 0})`
  );
  return result;
}
async function generateOpenRouterText(config, prompt, system, modelName, maxTokens, cacheDocument, _cacheOptions, autoCacheContextualRetrieval = true) {
  const openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
    baseURL: config.OPENROUTER_BASE_URL
  });
  const modelInstance = openrouter.chat(modelName);
  const isClaudeModel = modelName.toLowerCase().includes("claude");
  const isGeminiModel = modelName.toLowerCase().includes("gemini");
  const isGemini25Model = modelName.toLowerCase().includes("gemini-2.5");
  const supportsCaching = isClaudeModel || isGeminiModel;
  let documentForCaching = cacheDocument;
  if (!documentForCaching && autoCacheContextualRetrieval && supportsCaching) {
    const docMatch = prompt.match(/<document>([\s\S]*?)<\/document>/);
    if (docMatch && docMatch[1]) {
      documentForCaching = docMatch[1].trim();
      logger2.debug(
        `[Document Processor] Auto-detected document for caching (${documentForCaching.length} chars)`
      );
    }
  }
  if (documentForCaching && supportsCaching) {
    let promptText = prompt;
    if (promptText.includes("<document>")) {
      promptText = promptText.replace(/<document>[\s\S]*?<\/document>/, "").trim();
    }
    if (isClaudeModel) {
      return await generateClaudeWithCaching(
        promptText,
        system,
        modelInstance,
        modelName,
        maxTokens,
        documentForCaching
      );
    } else if (isGeminiModel) {
      return await generateGeminiWithCaching(
        promptText,
        system,
        modelInstance,
        modelName,
        maxTokens,
        documentForCaching,
        isGemini25Model
      );
    }
  }
  logger2.debug("[Document Processor] Using standard request without caching");
  return await generateStandardOpenRouterText(prompt, system, modelInstance, modelName, maxTokens);
}
async function generateClaudeWithCaching(promptText, system, modelInstance, modelName, maxTokens, documentForCaching) {
  logger2.debug(`[Document Processor] Using explicit prompt caching with Claude ${modelName}`);
  const messages = [
    // System message with cached document (if system is provided)
    system ? {
      role: "system",
      content: [
        {
          type: "text",
          text: system
        },
        {
          type: "text",
          text: documentForCaching,
          cache_control: {
            type: "ephemeral"
          }
        }
      ]
    } : (
      // User message with cached document (if no system message)
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Document for context:"
          },
          {
            type: "text",
            text: documentForCaching,
            cache_control: {
              type: "ephemeral"
            }
          },
          {
            type: "text",
            text: promptText
          }
        ]
      }
    ),
    // Only add user message if system was provided (otherwise we included user above)
    system ? {
      role: "user",
      content: [
        {
          type: "text",
          text: promptText
        }
      ]
    } : null
  ].filter(Boolean);
  logger2.debug("[Document Processor] Using Claude-specific caching structure");
  const result = await aiGenerateText({
    model: modelInstance,
    messages,
    temperature: 0.3,
    maxOutputTokens: maxTokens,
    providerOptions: {
      openrouter: {
        usage: {
          include: true
        }
      }
    }
  });
  logCacheMetrics(result);
  const totalTokens = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0);
  logger2.debug(
    `[Document Processor] OpenRouter ${modelName}: ${totalTokens} tokens (${result.usage.inputTokens || 0}\u2192${result.usage.outputTokens || 0})`
  );
  return result;
}
async function generateGeminiWithCaching(promptText, system, modelInstance, modelName, maxTokens, documentForCaching, isGemini25Model) {
  const usingImplicitCaching = isGemini25Model;
  const estimatedDocTokens = Math.ceil(documentForCaching.length / 4);
  const minTokensForImplicitCache = modelName.toLowerCase().includes("flash") ? 1028 : 2048;
  const likelyTriggersCaching = estimatedDocTokens >= minTokensForImplicitCache;
  if (usingImplicitCaching) {
    logger2.debug(`[Document Processor] Using Gemini 2.5 implicit caching with ${modelName}`);
    logger2.debug(
      `[Document Processor] Gemini 2.5 models automatically cache large prompts (no cache_control needed)`
    );
    if (likelyTriggersCaching) {
      logger2.debug(
        `[Document Processor] Document ~${estimatedDocTokens} tokens exceeds ${minTokensForImplicitCache} token threshold for caching`
      );
    } else {
      logger2.debug(
        `[Document Processor] Document ~${estimatedDocTokens} tokens may not meet ${minTokensForImplicitCache} token threshold for caching`
      );
    }
  } else {
    logger2.debug(`[Document Processor] Using standard prompt format with Gemini ${modelName}`);
    logger2.debug(
      `[Document Processor] Note: Only Gemini 2.5 models support automatic implicit caching`
    );
  }
  const geminiSystemPrefix = system ? `${system}

` : "";
  const geminiPrompt = `${geminiSystemPrefix}${documentForCaching}

${promptText}`;
  const result = await aiGenerateText({
    model: modelInstance,
    prompt: geminiPrompt,
    temperature: 0.3,
    maxOutputTokens: maxTokens,
    providerOptions: {
      openrouter: {
        usage: {
          include: true
          // Include usage info to see cache metrics
        }
      }
    }
  });
  logCacheMetrics(result);
  const totalTokens = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0);
  const cachingType = usingImplicitCaching ? "implicit" : "standard";
  logger2.debug(
    `[Document Processor] OpenRouter ${modelName} (${cachingType} caching): ${totalTokens} tokens (${result.usage.inputTokens || 0}\u2192${result.usage.outputTokens || 0})`
  );
  return result;
}
async function generateStandardOpenRouterText(prompt, system, modelInstance, modelName, maxTokens) {
  const result = await aiGenerateText({
    model: modelInstance,
    prompt,
    system,
    temperature: 0.3,
    maxOutputTokens: maxTokens,
    providerOptions: {
      openrouter: {
        usage: {
          include: true
          // Include usage info to see cache metrics
        }
      }
    }
  });
  const totalTokens = (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0);
  logger2.debug(
    `[Document Processor] OpenRouter ${modelName}: ${totalTokens} tokens (${result.usage.inputTokens || 0}\u2192${result.usage.outputTokens || 0})`
  );
  return result;
}
function logCacheMetrics(result) {
  if (result.usage && result.usage.cacheTokens) {
    logger2.debug(
      `[Document Processor] Cache metrics - tokens: ${result.usage.cacheTokens}, discount: ${result.usage.cacheDiscount}`
    );
  }
}

// src/utils.ts
import { Buffer as Buffer2 } from "buffer";
import * as mammoth from "mammoth";
import { logger as logger3 } from "@elizaos/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createHash as createHash2 } from "crypto";
var PLAIN_TEXT_CONTENT_TYPES = [
  "application/typescript",
  "text/typescript",
  "text/x-python",
  "application/x-python-code",
  "application/yaml",
  "text/yaml",
  "application/x-yaml",
  "application/json",
  "text/markdown",
  "text/csv"
];
var MAX_FALLBACK_SIZE_BYTES = 5 * 1024 * 1024;
var BINARY_CHECK_BYTES = 1024;
async function extractTextFromFileBuffer(fileBuffer, contentType, originalFilename) {
  const lowerContentType = contentType.toLowerCase();
  logger3.debug(
    `[TextUtil] Attempting to extract text from ${originalFilename} (type: ${contentType})`
  );
  if (lowerContentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    logger3.debug(`[TextUtil] Extracting text from DOCX ${originalFilename} via mammoth.`);
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      logger3.debug(
        `[TextUtil] DOCX text extraction complete for ${originalFilename}. Text length: ${result.value.length}`
      );
      return result.value;
    } catch (docxError) {
      const errorMsg = `[TextUtil] Failed to parse DOCX file ${originalFilename}: ${docxError.message}`;
      logger3.error(errorMsg, docxError.stack);
      throw new Error(errorMsg);
    }
  } else if (lowerContentType === "application/msword" || originalFilename.toLowerCase().endsWith(".doc")) {
    logger3.debug(`[TextUtil] Handling Microsoft Word .doc file: ${originalFilename}`);
    return `[Microsoft Word Document: ${originalFilename}]

This document was indexed for search but cannot be displayed directly in the browser. The original document content is preserved for retrieval purposes.`;
  } else if (lowerContentType.startsWith("text/") || PLAIN_TEXT_CONTENT_TYPES.includes(lowerContentType)) {
    logger3.debug(
      `[TextUtil] Extracting text from plain text compatible file ${originalFilename} (type: ${contentType})`
    );
    return fileBuffer.toString("utf-8");
  } else {
    logger3.warn(
      `[TextUtil] Unsupported content type: "${contentType}" for ${originalFilename}. Attempting fallback to plain text.`
    );
    if (fileBuffer.length > MAX_FALLBACK_SIZE_BYTES) {
      const sizeErrorMsg = `[TextUtil] File ${originalFilename} (type: ${contentType}) exceeds maximum size for fallback (${MAX_FALLBACK_SIZE_BYTES} bytes). Cannot process as plain text.`;
      logger3.error(sizeErrorMsg);
      throw new Error(sizeErrorMsg);
    }
    const initialBytes = fileBuffer.subarray(0, Math.min(fileBuffer.length, BINARY_CHECK_BYTES));
    if (initialBytes.includes(0)) {
      const binaryHeuristicMsg = `[TextUtil] File ${originalFilename} (type: ${contentType}) appears to be binary based on initial byte check. Cannot process as plain text.`;
      logger3.error(binaryHeuristicMsg);
      throw new Error(binaryHeuristicMsg);
    }
    try {
      const textContent = fileBuffer.toString("utf-8");
      if (textContent.includes("\uFFFD")) {
        const binaryErrorMsg = `[TextUtil] File ${originalFilename} (type: ${contentType}) seems to be binary or has encoding issues after fallback to plain text (detected \uFFFD).`;
        logger3.error(binaryErrorMsg);
        throw new Error(binaryErrorMsg);
      }
      logger3.debug(
        `[TextUtil] Successfully processed unknown type ${contentType} as plain text after fallback for ${originalFilename}.`
      );
      return textContent;
    } catch (fallbackError) {
      const finalErrorMsg = `[TextUtil] Unsupported content type: ${contentType} for ${originalFilename}. Fallback to plain text also failed or indicated binary content.`;
      logger3.error(finalErrorMsg, fallbackError.message ? fallbackError.stack : void 0);
      throw new Error(finalErrorMsg);
    }
  }
}
async function convertPdfToTextFromBuffer(pdfBuffer, filename) {
  const docName = filename || "unnamed-document";
  logger3.debug(`[PdfService] Starting conversion for ${docName}`);
  try {
    const uint8Array = new Uint8Array(pdfBuffer);
    const pdf = await getDocument({ data: uint8Array }).promise;
    const numPages = pdf.numPages;
    const textPages = [];
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      logger3.debug(`[PdfService] Processing page ${pageNum}/${numPages}`);
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lineMap = /* @__PURE__ */ new Map();
      textContent.items.filter(isTextItem).forEach((item) => {
        const yPos = Math.round(item.transform[5]);
        if (!lineMap.has(yPos)) {
          lineMap.set(yPos, []);
        }
        lineMap.get(yPos).push(item);
      });
      const sortedLines = Array.from(lineMap.entries()).sort((a, b) => b[0] - a[0]).map(
        ([_, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(" ")
      );
      textPages.push(sortedLines.join("\n"));
    }
    const fullText = textPages.join("\n\n").replace(/\s+/g, " ").trim();
    logger3.debug(`[PdfService] Conversion complete for ${docName}, length: ${fullText.length}`);
    return fullText;
  } catch (error) {
    logger3.error(`[PdfService] Error converting PDF ${docName}:`, error.message);
    throw new Error(`Failed to convert PDF to text: ${error.message}`);
  }
}
function isBinaryContentType(contentType, filename) {
  const textContentTypes = [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-yaml",
    "application/x-sh"
  ];
  const isTextMimeType = textContentTypes.some((type) => contentType.includes(type));
  if (isTextMimeType) {
    return false;
  }
  const binaryContentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
    "image/",
    "audio/",
    "video/"
  ];
  const isBinaryMimeType = binaryContentTypes.some((type) => contentType.includes(type));
  if (isBinaryMimeType) {
    return true;
  }
  const fileExt = filename.split(".").pop()?.toLowerCase() || "";
  const textExtensions = [
    "txt",
    "md",
    "markdown",
    "json",
    "xml",
    "html",
    "htm",
    "css",
    "js",
    "ts",
    "jsx",
    "tsx",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "sh",
    "bash",
    "zsh",
    "fish",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "php",
    "sql",
    "r",
    "swift",
    "kt",
    "scala",
    "clj",
    "ex",
    "exs",
    "vim",
    "env",
    "gitignore",
    "dockerignore",
    "editorconfig",
    "log",
    "csv",
    "tsv",
    "properties",
    "gradle",
    "sbt",
    "makefile",
    "dockerfile",
    "vagrantfile",
    "gemfile",
    "rakefile",
    "podfile",
    "csproj",
    "vbproj",
    "fsproj",
    "sln",
    "pom"
  ];
  if (textExtensions.includes(fileExt)) {
    return false;
  }
  const binaryExtensions = [
    "pdf",
    "docx",
    "doc",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "bz2",
    "xz",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "svg",
    "ico",
    "webp",
    "mp3",
    "mp4",
    "avi",
    "mov",
    "wmv",
    "flv",
    "wav",
    "flac",
    "ogg",
    "exe",
    "dll",
    "so",
    "dylib",
    "bin",
    "dat",
    "db",
    "sqlite"
  ];
  return binaryExtensions.includes(fileExt);
}
function isTextItem(item) {
  return "str" in item;
}
function normalizeS3Url(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (error) {
    logger3.warn(`[URL NORMALIZER] Failed to parse URL: ${url}. Returning original.`);
    return url;
  }
}
async function fetchUrlContent(url) {
  logger3.debug(`[URL FETCHER] Fetching content from URL: ${url}`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3e4);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Eliza-Knowledge-Plugin/1.0"
      }
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    logger3.debug(`[URL FETCHER] Content type from server: ${contentType} for URL: ${url}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer2.from(arrayBuffer);
    const base64Content = buffer.toString("base64");
    logger3.debug(
      `[URL FETCHER] Successfully fetched content from URL: ${url} (${buffer.length} bytes)`
    );
    return {
      content: base64Content,
      contentType
    };
  } catch (error) {
    logger3.error(`[URL FETCHER] Error fetching content from URL ${url}: ${error.message}`);
    throw new Error(`Failed to fetch content from URL: ${error.message}`);
  }
}
function looksLikeBase64(content) {
  if (!content || content.length === 0) return false;
  const cleanContent = content.replace(/\s/g, "");
  if (cleanContent.length < 16) return false;
  if (cleanContent.length % 4 !== 0) return false;
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(cleanContent)) return false;
  const hasNumbers = /\d/.test(cleanContent);
  const hasUpperCase = /[A-Z]/.test(cleanContent);
  const hasLowerCase = /[a-z]/.test(cleanContent);
  return (hasNumbers || hasUpperCase) && hasLowerCase;
}
function generateContentBasedId(content, agentId, options) {
  const {
    maxChars = 2e3,
    // Use first 2000 chars by default
    includeFilename,
    contentType
  } = options || {};
  let contentForHashing;
  if (looksLikeBase64(content)) {
    try {
      const decoded = Buffer2.from(content, "base64").toString("utf8");
      if (!decoded.includes("\uFFFD") || contentType?.includes("pdf")) {
        contentForHashing = content.slice(0, maxChars);
      } else {
        contentForHashing = decoded.slice(0, maxChars);
      }
    } catch {
      contentForHashing = content.slice(0, maxChars);
    }
  } else {
    contentForHashing = content.slice(0, maxChars);
  }
  contentForHashing = contentForHashing.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const componentsToHash = [
    agentId,
    // Namespace by agent
    contentForHashing,
    // The actual content
    includeFilename || ""
    // Optional filename for additional uniqueness
  ].filter(Boolean).join("::");
  const hash = createHash2("sha256").update(componentsToHash).digest("hex");
  const DOCUMENT_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
  const uuid = v5_default(hash, DOCUMENT_NAMESPACE);
  logger3.debug(
    `[generateContentBasedId] Generated UUID ${uuid} for document with content hash ${hash.slice(0, 8)}...`
  );
  return uuid;
}

// src/document-processor.ts
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function getCtxKnowledgeEnabled(runtime) {
  let result;
  let source;
  let rawValue;
  if (runtime) {
    rawValue = runtime.getSetting("CTX_KNOWLEDGE_ENABLED");
    const cleanValue = rawValue?.toString().trim().toLowerCase();
    result = cleanValue === "true";
    source = "runtime.getSetting()";
  } else {
    rawValue = process.env.CTX_KNOWLEDGE_ENABLED;
    const cleanValue = rawValue?.toString().trim().toLowerCase();
    result = cleanValue === "true";
    source = "process.env";
  }
  if (process.env.NODE_ENV === "development" && rawValue && !result) {
    logger4.debug(`[Document Processor] CTX config mismatch - ${source}: '${rawValue}' \u2192 ${result}`);
  }
  return result;
}
function shouldUseCustomLLM() {
  const textProvider = process.env.TEXT_PROVIDER;
  const textModel = process.env.TEXT_MODEL;
  if (!textProvider || !textModel) {
    return false;
  }
  switch (textProvider.toLowerCase()) {
    case "openrouter":
      return !!process.env.OPENROUTER_API_KEY;
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "google":
      return !!process.env.GOOGLE_API_KEY;
    default:
      return false;
  }
}
var useCustomLLM = shouldUseCustomLLM();
async function processFragmentsSynchronously({
  runtime,
  documentId,
  fullDocumentText,
  agentId,
  contentType,
  roomId,
  entityId,
  worldId,
  documentTitle
}) {
  if (!fullDocumentText || fullDocumentText.trim() === "") {
    logger4.warn(`No text content available to chunk for document ${documentId}.`);
    return 0;
  }
  const chunks = await splitDocumentIntoChunks(fullDocumentText);
  if (chunks.length === 0) {
    logger4.warn(`No chunks generated from text for ${documentId}. No fragments to save.`);
    return 0;
  }
  const docName = documentTitle || documentId.substring(0, 8);
  logger4.info(`[Document Processor] "${docName}": Split into ${chunks.length} chunks`);
  const providerLimits = await getProviderRateLimits();
  const CONCURRENCY_LIMIT = Math.min(30, providerLimits.maxConcurrentRequests || 30);
  const rateLimiter = createRateLimiter(
    providerLimits.requestsPerMinute || 60,
    providerLimits.tokensPerMinute
  );
  logger4.debug(
    `[Document Processor] Rate limits: ${providerLimits.requestsPerMinute} RPM, ${providerLimits.tokensPerMinute} TPM (${providerLimits.provider}, concurrency: ${CONCURRENCY_LIMIT})`
  );
  const { savedCount, failedCount } = await processAndSaveFragments({
    runtime,
    documentId,
    chunks,
    fullDocumentText,
    contentType,
    agentId,
    roomId: roomId || agentId,
    entityId: entityId || agentId,
    worldId: worldId || agentId,
    concurrencyLimit: CONCURRENCY_LIMIT,
    rateLimiter,
    documentTitle
  });
  const successRate = (savedCount / chunks.length * 100).toFixed(1);
  if (failedCount > 0) {
    logger4.warn(
      `[Document Processor] "${docName}": ${failedCount}/${chunks.length} chunks failed processing`
    );
  }
  logger4.info(
    `[Document Processor] "${docName}" complete: ${savedCount}/${chunks.length} fragments saved (${successRate}% success)`
  );
  logKnowledgeGenerationSummary({
    documentId,
    totalChunks: chunks.length,
    savedCount,
    failedCount,
    successRate: parseFloat(successRate),
    ctxEnabled: getCtxKnowledgeEnabled(runtime),
    providerLimits
  });
  return savedCount;
}
async function extractTextFromDocument(fileBuffer, contentType, originalFilename) {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error(`Empty file buffer provided for ${originalFilename}. Cannot extract text.`);
  }
  try {
    if (contentType === "application/pdf") {
      logger4.debug(`Extracting text from PDF: ${originalFilename}`);
      return await convertPdfToTextFromBuffer(fileBuffer, originalFilename);
    } else {
      logger4.debug(`Extracting text from non-PDF: ${originalFilename} (Type: ${contentType})`);
      if (contentType.includes("text/") || contentType.includes("application/json") || contentType.includes("application/xml")) {
        try {
          return fileBuffer.toString("utf8");
        } catch (textError) {
          logger4.warn(
            `Failed to decode ${originalFilename} as UTF-8, falling back to binary extraction`
          );
        }
      }
      return await extractTextFromFileBuffer(fileBuffer, contentType, originalFilename);
    }
  } catch (error) {
    logger4.error(`Error extracting text from ${originalFilename}: ${error.message}`);
    throw new Error(`Failed to extract text from ${originalFilename}: ${error.message}`);
  }
}
function createDocumentMemory({
  text,
  agentId,
  clientDocumentId,
  originalFilename,
  contentType,
  worldId,
  fileSize,
  documentId,
  customMetadata
}) {
  const fileExt = originalFilename.split(".").pop()?.toLowerCase() || "";
  const title = originalFilename.replace(`.${fileExt}`, "");
  const docId = documentId || v4_default();
  return {
    id: docId,
    agentId,
    roomId: agentId,
    worldId,
    entityId: agentId,
    content: { text },
    metadata: {
      type: MemoryType.DOCUMENT,
      documentId: clientDocumentId,
      originalFilename,
      contentType,
      title,
      fileExt,
      fileSize,
      source: "rag-service-main-upload",
      timestamp: Date.now(),
      // Merge custom metadata if provided
      ...customMetadata || {}
    }
  };
}
async function splitDocumentIntoChunks(documentText) {
  const tokenChunkSize = DEFAULT_CHUNK_TOKEN_SIZE;
  const tokenChunkOverlap = DEFAULT_CHUNK_OVERLAP_TOKENS;
  const targetCharChunkSize = Math.round(tokenChunkSize * DEFAULT_CHARS_PER_TOKEN);
  const targetCharChunkOverlap = Math.round(tokenChunkOverlap * DEFAULT_CHARS_PER_TOKEN);
  logger4.debug(
    `Using core splitChunks with settings: tokenChunkSize=${tokenChunkSize}, tokenChunkOverlap=${tokenChunkOverlap}, charChunkSize=${targetCharChunkSize}, charChunkOverlap=${targetCharChunkOverlap}`
  );
  return await splitChunks(documentText, tokenChunkSize, tokenChunkOverlap);
}
async function processAndSaveFragments({
  runtime,
  documentId,
  chunks,
  fullDocumentText,
  contentType,
  agentId,
  roomId,
  entityId,
  worldId,
  concurrencyLimit,
  rateLimiter,
  documentTitle
}) {
  let savedCount = 0;
  let failedCount = 0;
  const failedChunks = [];
  for (let i = 0; i < chunks.length; i += concurrencyLimit) {
    const batchChunks = chunks.slice(i, i + concurrencyLimit);
    const batchOriginalIndices = Array.from({ length: batchChunks.length }, (_, k) => i + k);
    logger4.debug(
      `[Document Processor] Batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(chunks.length / concurrencyLimit)}: processing ${batchChunks.length} chunks (${batchOriginalIndices[0]}-${batchOriginalIndices[batchOriginalIndices.length - 1]})`
    );
    const contextualizedChunks = await getContextualizedChunks(
      runtime,
      fullDocumentText,
      batchChunks,
      contentType,
      batchOriginalIndices,
      documentTitle
    );
    const embeddingResults = await generateEmbeddingsForChunks(
      runtime,
      contextualizedChunks,
      rateLimiter
    );
    for (const result of embeddingResults) {
      const originalChunkIndex = result.index;
      if (!result.success) {
        failedCount++;
        failedChunks.push(originalChunkIndex);
        logger4.warn(`Failed to process chunk ${originalChunkIndex} for document ${documentId}`);
        continue;
      }
      const contextualizedChunkText = result.text;
      const embedding = result.embedding;
      if (!embedding || embedding.length === 0) {
        logger4.warn(
          `Zero vector detected for chunk ${originalChunkIndex} (document ${documentId}). Embedding: ${JSON.stringify(result.embedding)}`
        );
        failedCount++;
        failedChunks.push(originalChunkIndex);
        continue;
      }
      try {
        const fragmentMemory = {
          id: v4_default(),
          agentId,
          roomId: roomId || agentId,
          worldId: worldId || agentId,
          entityId: entityId || agentId,
          embedding,
          content: { text: contextualizedChunkText },
          metadata: {
            type: MemoryType.FRAGMENT,
            documentId,
            position: originalChunkIndex,
            timestamp: Date.now(),
            source: "rag-service-fragment-sync"
          }
        };
        await runtime.createMemory(fragmentMemory, "knowledge");
        if (originalChunkIndex === chunks.length - 1) {
          const docName = documentTitle || documentId.substring(0, 8);
          logger4.info(
            `[Document Processor] "${docName}": All ${chunks.length} chunks processed successfully`
          );
        }
        savedCount++;
      } catch (saveError) {
        logger4.error(
          `Error saving chunk ${originalChunkIndex} to database: ${saveError.message}`,
          saveError.stack
        );
        failedCount++;
        failedChunks.push(originalChunkIndex);
      }
    }
    if (i + concurrencyLimit < chunks.length) {
      await new Promise((resolve2) => setTimeout(resolve2, 500));
    }
  }
  return { savedCount, failedCount, failedChunks };
}
async function generateEmbeddingsForChunks(runtime, contextualizedChunks, rateLimiter) {
  const validChunks = contextualizedChunks.filter((chunk) => chunk.success);
  const failedChunks = contextualizedChunks.filter((chunk) => !chunk.success);
  if (validChunks.length === 0) {
    return failedChunks.map((chunk) => ({
      success: false,
      index: chunk.index,
      error: new Error("Chunk processing failed"),
      text: chunk.contextualizedText
    }));
  }
  return await Promise.all(
    contextualizedChunks.map(async (contextualizedChunk) => {
      if (!contextualizedChunk.success) {
        return {
          success: false,
          index: contextualizedChunk.index,
          error: new Error("Chunk processing failed"),
          text: contextualizedChunk.contextualizedText
        };
      }
      const embeddingTokens = estimateTokens(contextualizedChunk.contextualizedText);
      await rateLimiter(embeddingTokens);
      try {
        const generateEmbeddingOperation = async () => {
          return await generateEmbeddingWithValidation(
            runtime,
            contextualizedChunk.contextualizedText
          );
        };
        const { embedding, success, error } = await withRateLimitRetry(
          generateEmbeddingOperation,
          `embedding generation for chunk ${contextualizedChunk.index}`
        );
        if (!success) {
          return {
            success: false,
            index: contextualizedChunk.index,
            error,
            text: contextualizedChunk.contextualizedText
          };
        }
        return {
          embedding,
          success: true,
          index: contextualizedChunk.index,
          text: contextualizedChunk.contextualizedText
        };
      } catch (error) {
        logger4.error(
          `Error generating embedding for chunk ${contextualizedChunk.index}: ${error.message}`
        );
        return {
          success: false,
          index: contextualizedChunk.index,
          error,
          text: contextualizedChunk.contextualizedText
        };
      }
    })
  );
}
async function getContextualizedChunks(runtime, fullDocumentText, chunks, contentType, batchOriginalIndices, documentTitle) {
  const ctxEnabled = getCtxKnowledgeEnabled(runtime);
  if (batchOriginalIndices[0] === 0) {
    const docName = documentTitle || "Document";
    const provider = runtime?.getSetting("TEXT_PROVIDER") || process.env.TEXT_PROVIDER;
    const model = runtime?.getSetting("TEXT_MODEL") || process.env.TEXT_MODEL;
    logger4.info(
      `[Document Processor] "${docName}": CTX enrichment ${ctxEnabled ? "ENABLED" : "DISABLED"}${ctxEnabled ? ` (${provider}/${model})` : ""}`
    );
  }
  if (ctxEnabled && fullDocumentText) {
    return await generateContextsInBatch(
      runtime,
      fullDocumentText,
      chunks,
      contentType,
      batchOriginalIndices,
      documentTitle
    );
  } else if (!ctxEnabled && batchOriginalIndices[0] === 0) {
    logger4.debug(
      `[Document Processor] To enable CTX: Set CTX_KNOWLEDGE_ENABLED=true and configure TEXT_PROVIDER/TEXT_MODEL`
    );
  }
  return chunks.map((chunkText, idx) => ({
    contextualizedText: chunkText,
    index: batchOriginalIndices[idx],
    success: true
  }));
}
async function generateContextsInBatch(runtime, fullDocumentText, chunks, contentType, batchIndices, documentTitle) {
  if (!chunks || chunks.length === 0) {
    return [];
  }
  const providerLimits = await getProviderRateLimits();
  const rateLimiter = createRateLimiter(
    providerLimits.requestsPerMinute || 60,
    providerLimits.tokensPerMinute
  );
  const config = validateModelConfig(runtime);
  const isUsingOpenRouter = config.TEXT_PROVIDER === "openrouter";
  const isUsingCacheCapableModel = isUsingOpenRouter && (config.TEXT_MODEL?.toLowerCase().includes("claude") || config.TEXT_MODEL?.toLowerCase().includes("gemini"));
  logger4.debug(
    `[Document Processor] Contextualizing ${chunks.length} chunks with ${config.TEXT_PROVIDER}/${config.TEXT_MODEL} (cache: ${isUsingCacheCapableModel})`
  );
  const promptConfigs = prepareContextPrompts(
    chunks,
    fullDocumentText,
    contentType,
    batchIndices,
    isUsingCacheCapableModel
  );
  const contextualizedChunks = await Promise.all(
    promptConfigs.map(async (item) => {
      if (!item.valid) {
        return {
          contextualizedText: item.chunkText,
          success: false,
          index: item.originalIndex
        };
      }
      const llmTokens = estimateTokens(item.chunkText + (item.prompt || ""));
      await rateLimiter(llmTokens);
      try {
        let llmResponse;
        const generateTextOperation = async () => {
          if (useCustomLLM) {
            if (item.usesCaching) {
              return await generateText(runtime, item.promptText, item.systemPrompt, {
                cacheDocument: item.fullDocumentTextForContext,
                cacheOptions: { type: "ephemeral" },
                autoCacheContextualRetrieval: true
              });
            } else {
              return await generateText(runtime, item.prompt);
            }
          } else {
            if (item.usesCaching) {
              return await runtime.useModel(ModelType.TEXT_LARGE, {
                prompt: item.promptText,
                system: item.systemPrompt
              });
            } else {
              return await runtime.useModel(ModelType.TEXT_LARGE, {
                prompt: item.prompt
              });
            }
          }
        };
        llmResponse = await withRateLimitRetry(
          generateTextOperation,
          `context generation for chunk ${item.originalIndex}`
        );
        const generatedContext = typeof llmResponse === "string" ? llmResponse : llmResponse.text;
        const contextualizedText = getChunkWithContext(item.chunkText, generatedContext);
        if ((item.originalIndex + 1) % Math.max(1, Math.floor(chunks.length / 3)) === 0 || item.originalIndex === chunks.length - 1) {
          const docName = documentTitle || "Document";
          logger4.debug(
            `[Document Processor] "${docName}": Context added for ${item.originalIndex + 1}/${chunks.length} chunks`
          );
        }
        return {
          contextualizedText,
          success: true,
          index: item.originalIndex
        };
      } catch (error) {
        logger4.error(
          `Error generating context for chunk ${item.originalIndex}: ${error.message}`,
          error.stack
        );
        return {
          contextualizedText: item.chunkText,
          success: false,
          index: item.originalIndex
        };
      }
    })
  );
  return contextualizedChunks;
}
function prepareContextPrompts(chunks, fullDocumentText, contentType, batchIndices, isUsingCacheCapableModel = false) {
  return chunks.map((chunkText, idx) => {
    const originalIndex = batchIndices ? batchIndices[idx] : idx;
    try {
      if (isUsingCacheCapableModel) {
        const cachingPromptInfo = contentType ? getCachingPromptForMimeType(contentType, chunkText) : getCachingContextualizationPrompt(chunkText);
        if (cachingPromptInfo.prompt.startsWith("Error:")) {
          logger4.warn(
            `Skipping contextualization for chunk ${originalIndex} due to: ${cachingPromptInfo.prompt}`
          );
          return {
            originalIndex,
            chunkText,
            valid: false,
            usesCaching: false
          };
        }
        return {
          valid: true,
          originalIndex,
          chunkText,
          usesCaching: true,
          systemPrompt: cachingPromptInfo.systemPrompt,
          promptText: cachingPromptInfo.prompt,
          fullDocumentTextForContext: fullDocumentText
        };
      } else {
        const prompt = contentType ? getPromptForMimeType(contentType, fullDocumentText, chunkText) : getContextualizationPrompt(fullDocumentText, chunkText);
        if (prompt.startsWith("Error:")) {
          logger4.warn(`Skipping contextualization for chunk ${originalIndex} due to: ${prompt}`);
          return {
            prompt: null,
            originalIndex,
            chunkText,
            valid: false,
            usesCaching: false
          };
        }
        return {
          prompt,
          originalIndex,
          chunkText,
          valid: true,
          usesCaching: false
        };
      }
    } catch (error) {
      logger4.error(
        `Error preparing prompt for chunk ${originalIndex}: ${error.message}`,
        error.stack
      );
      return {
        prompt: null,
        originalIndex,
        chunkText,
        valid: false,
        usesCaching: false
      };
    }
  });
}
async function generateEmbeddingWithValidation(runtime, text) {
  try {
    const embeddingResult = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
      text
    });
    const embedding = Array.isArray(embeddingResult) ? embeddingResult : embeddingResult?.embedding;
    if (!embedding || embedding.length === 0) {
      logger4.warn(`Zero vector detected. Embedding result: ${JSON.stringify(embedding)}`);
      return {
        embedding: null,
        success: false,
        error: new Error("Zero vector detected")
      };
    }
    return { embedding, success: true };
  } catch (error) {
    return { embedding: null, success: false, error };
  }
}
async function withRateLimitRetry(operation, errorContext, retryDelay) {
  try {
    return await operation();
  } catch (error) {
    if (error.status === 429) {
      const delay = retryDelay || error.headers?.["retry-after"] || 5;
      logger4.warn(`Rate limit hit for ${errorContext}. Retrying after ${delay}s`);
      await new Promise((resolve2) => setTimeout(resolve2, delay * 1e3));
      try {
        return await operation();
      } catch (retryError) {
        logger4.error(`Failed after retry for ${errorContext}: ${retryError.message}`);
        throw retryError;
      }
    }
    throw error;
  }
}
function createRateLimiter(requestsPerMinute, tokensPerMinute) {
  const requestTimes = [];
  const tokenUsage = [];
  const intervalMs = 60 * 1e3;
  return async function rateLimiter(estimatedTokens = 1e3) {
    const now = Date.now();
    while (requestTimes.length > 0 && now - requestTimes[0] > intervalMs) {
      requestTimes.shift();
    }
    while (tokenUsage.length > 0 && now - tokenUsage[0].timestamp > intervalMs) {
      tokenUsage.shift();
    }
    const currentTokens = tokenUsage.reduce((sum, usage) => sum + usage.tokens, 0);
    const requestLimitExceeded = requestTimes.length >= requestsPerMinute;
    const tokenLimitExceeded = tokensPerMinute && currentTokens + estimatedTokens > tokensPerMinute;
    if (requestLimitExceeded || tokenLimitExceeded) {
      let timeToWait = 0;
      if (requestLimitExceeded) {
        const oldestRequest = requestTimes[0];
        timeToWait = Math.max(timeToWait, oldestRequest + intervalMs - now);
      }
      if (tokenLimitExceeded && tokenUsage.length > 0) {
        const oldestTokenUsage = tokenUsage[0];
        timeToWait = Math.max(timeToWait, oldestTokenUsage.timestamp + intervalMs - now);
      }
      if (timeToWait > 0) {
        const reason = requestLimitExceeded ? "request" : "token";
        if (timeToWait > 5e3) {
          logger4.info(
            `[Document Processor] Rate limiting: waiting ${Math.round(timeToWait / 1e3)}s due to ${reason} limit`
          );
        } else {
          logger4.debug(
            `[Document Processor] Rate limiting: ${timeToWait}ms wait (${reason} limit)`
          );
        }
        await new Promise((resolve2) => setTimeout(resolve2, timeToWait));
      }
    }
    requestTimes.push(now);
    if (tokensPerMinute) {
      tokenUsage.push({ timestamp: now, tokens: estimatedTokens });
    }
  };
}
function logKnowledgeGenerationSummary({
  totalChunks,
  savedCount,
  failedCount,
  ctxEnabled,
  providerLimits
}) {
  if (failedCount > 0 || process.env.NODE_ENV === "development") {
    const status = failedCount > 0 ? "PARTIAL" : "SUCCESS";
    logger4.info(
      `[Document Processor] ${status}: ${savedCount}/${totalChunks} chunks, CTX: ${ctxEnabled ? "ON" : "OFF"}, Provider: ${providerLimits.provider}`
    );
  }
  if (failedCount > 0) {
    logger4.warn(`[Document Processor] ${failedCount} chunks failed processing`);
  }
}

// src/docs-loader.ts
import { logger as logger5 } from "@elizaos/core";
import * as fs from "fs";
import * as path from "path";
function getKnowledgePath(runtimePath) {
  const knowledgePath = runtimePath || process.env.KNOWLEDGE_PATH || path.join(process.cwd(), "docs");
  const resolvedPath = path.resolve(knowledgePath);
  if (!fs.existsSync(resolvedPath)) {
    logger5.warn(`Knowledge path does not exist: ${resolvedPath}`);
    if (runtimePath) {
      logger5.warn("Please create the directory or update KNOWLEDGE_PATH in agent settings");
    } else if (process.env.KNOWLEDGE_PATH) {
      logger5.warn("Please create the directory or update KNOWLEDGE_PATH environment variable");
    } else {
      logger5.info("To use the knowledge plugin, either:");
      logger5.info('1. Create a "docs" folder in your project root');
      logger5.info("2. Set KNOWLEDGE_PATH in agent settings or environment variable");
    }
  }
  return resolvedPath;
}
async function loadDocsFromPath(service, agentId, worldId, knowledgePath) {
  const docsPath = getKnowledgePath(knowledgePath);
  if (!fs.existsSync(docsPath)) {
    logger5.warn(`Knowledge path does not exist: ${docsPath}`);
    return { total: 0, successful: 0, failed: 0 };
  }
  logger5.info(`Loading documents from: ${docsPath}`);
  const files = getAllFiles(docsPath);
  if (files.length === 0) {
    logger5.info("No files found in knowledge path");
    return { total: 0, successful: 0, failed: 0 };
  }
  logger5.info(`Found ${files.length} files to process`);
  let successful = 0;
  let failed = 0;
  for (const filePath of files) {
    try {
      const fileName = path.basename(filePath);
      const fileExt = path.extname(filePath).toLowerCase();
      if (fileName.startsWith(".")) {
        continue;
      }
      const contentType = getContentType(fileExt);
      if (!contentType) {
        logger5.debug(`Skipping unsupported file type: ${filePath}`);
        continue;
      }
      const fileBuffer = fs.readFileSync(filePath);
      const isBinary = isBinaryContentType(contentType, fileName);
      const content = isBinary ? fileBuffer.toString("base64") : fileBuffer.toString("utf-8");
      const knowledgeOptions = {
        clientDocumentId: "",
        // Will be generated by the service based on content
        contentType,
        originalFilename: fileName,
        worldId: worldId || agentId,
        content,
        roomId: agentId,
        entityId: agentId
      };
      logger5.debug(`Processing document: ${fileName}`);
      const result = await service.addKnowledge(knowledgeOptions);
      logger5.info(`\u2705 "${fileName}": ${result.fragmentCount} fragments created`);
      successful++;
    } catch (error) {
      logger5.error({ error }, `Failed to process file ${filePath}`);
      failed++;
    }
  }
  logger5.info(
    `Document loading complete: ${successful} successful, ${failed} failed out of ${files.length} total`
  );
  return {
    total: files.length,
    successful,
    failed
  };
}
function getAllFiles(dirPath, files = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", ".vscode", "dist", "build"].includes(entry.name)) {
          getAllFiles(fullPath, files);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    logger5.error({ error }, `Error reading directory ${dirPath}`);
  }
  return files;
}
function getContentType(extension) {
  const contentTypes = {
    // Text documents
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".tson": "text/plain",
    ".xml": "application/xml",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".log": "text/plain",
    // Web files
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".scss": "text/x-scss",
    ".sass": "text/x-sass",
    ".less": "text/x-less",
    // JavaScript/TypeScript
    ".js": "text/javascript",
    ".jsx": "text/javascript",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".mjs": "text/javascript",
    ".cjs": "text/javascript",
    ".vue": "text/x-vue",
    ".svelte": "text/x-svelte",
    ".astro": "text/x-astro",
    // Python
    ".py": "text/x-python",
    ".pyw": "text/x-python",
    ".pyi": "text/x-python",
    // Java/Kotlin/Scala
    ".java": "text/x-java",
    ".kt": "text/x-kotlin",
    ".kts": "text/x-kotlin",
    ".scala": "text/x-scala",
    // C/C++/C#
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".cc": "text/x-c++",
    ".cxx": "text/x-c++",
    ".h": "text/x-c",
    ".hpp": "text/x-c++",
    ".cs": "text/x-csharp",
    // Other languages
    ".php": "text/x-php",
    ".rb": "text/x-ruby",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".swift": "text/x-swift",
    ".r": "text/x-r",
    ".R": "text/x-r",
    ".m": "text/x-objectivec",
    ".mm": "text/x-objectivec",
    ".clj": "text/x-clojure",
    ".cljs": "text/x-clojure",
    ".ex": "text/x-elixir",
    ".exs": "text/x-elixir",
    ".lua": "text/x-lua",
    ".pl": "text/x-perl",
    ".pm": "text/x-perl",
    ".dart": "text/x-dart",
    ".hs": "text/x-haskell",
    ".elm": "text/x-elm",
    ".ml": "text/x-ocaml",
    ".fs": "text/x-fsharp",
    ".fsx": "text/x-fsharp",
    ".vb": "text/x-vb",
    ".pas": "text/x-pascal",
    ".d": "text/x-d",
    ".nim": "text/x-nim",
    ".zig": "text/x-zig",
    ".jl": "text/x-julia",
    ".tcl": "text/x-tcl",
    ".awk": "text/x-awk",
    ".sed": "text/x-sed",
    // Shell scripts
    ".sh": "text/x-sh",
    ".bash": "text/x-sh",
    ".zsh": "text/x-sh",
    ".fish": "text/x-fish",
    ".ps1": "text/x-powershell",
    ".bat": "text/x-batch",
    ".cmd": "text/x-batch",
    // Config files
    ".json": "application/json",
    ".yaml": "text/x-yaml",
    ".yml": "text/x-yaml",
    ".toml": "text/x-toml",
    ".ini": "text/x-ini",
    ".cfg": "text/x-ini",
    ".conf": "text/x-ini",
    ".env": "text/plain",
    ".gitignore": "text/plain",
    ".dockerignore": "text/plain",
    ".editorconfig": "text/plain",
    ".properties": "text/x-properties",
    // Database
    ".sql": "text/x-sql",
    // Binary documents
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };
  return contentTypes[extension] || null;
}

// src/service.ts
var parseBooleanEnv2 = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};
var KnowledgeService = class _KnowledgeService extends Service {
  static serviceType = "knowledge";
  config = {};
  knowledgeConfig = {};
  capabilityDescription = "Provides Retrieval Augmented Generation capabilities, including knowledge upload and querying.";
  knowledgeProcessingSemaphore;
  /**
   * Create a new Knowledge service
   * @param runtime Agent runtime
   */
  constructor(runtime, config) {
    super(runtime);
    this.knowledgeProcessingSemaphore = new Semaphore(10);
  }
  async loadInitialDocuments() {
    logger6.info(
      `KnowledgeService: Checking for documents to load on startup for agent ${this.runtime.agentId}`
    );
    try {
      await new Promise((resolve2) => setTimeout(resolve2, 1e3));
      const knowledgePath = this.runtime.getSetting("KNOWLEDGE_PATH");
      const result = await loadDocsFromPath(
        this,
        this.runtime.agentId,
        void 0,
        // worldId
        knowledgePath
      );
      if (result.successful > 0) {
        logger6.info(
          `KnowledgeService: Loaded ${result.successful} documents from docs folder on startup for agent ${this.runtime.agentId}`
        );
      } else {
        logger6.info(
          `KnowledgeService: No new documents found to load on startup for agent ${this.runtime.agentId}`
        );
      }
    } catch (error) {
      logger6.error(
        { error },
        `KnowledgeService: Error loading documents on startup for agent ${this.runtime.agentId}`
      );
    }
  }
  /**
   * Start the Knowledge service
   * @param runtime Agent runtime
   * @returns Initialized Knowledge service
   */
  static async start(runtime) {
    logger6.info(`Starting Knowledge service for agent: ${runtime.agentId}`);
    logger6.info("Initializing Knowledge Plugin...");
    let validatedConfig = {};
    try {
      logger6.info("Validating model configuration for Knowledge plugin...");
      logger6.debug(`[Knowledge Plugin] INIT DEBUG:`);
      logger6.debug(
        `[Knowledge Plugin] - process.env.CTX_KNOWLEDGE_ENABLED: '${process.env.CTX_KNOWLEDGE_ENABLED}'`
      );
      const config = {
        CTX_KNOWLEDGE_ENABLED: parseBooleanEnv2(runtime.getSetting("CTX_KNOWLEDGE_ENABLED"))
      };
      logger6.debug(
        `[Knowledge Plugin] - config.CTX_KNOWLEDGE_ENABLED: '${config.CTX_KNOWLEDGE_ENABLED}'`
      );
      logger6.debug(
        `[Knowledge Plugin] - runtime.getSetting('CTX_KNOWLEDGE_ENABLED'): '${runtime.getSetting("CTX_KNOWLEDGE_ENABLED")}'`
      );
      validatedConfig = validateModelConfig(runtime);
      const ctxEnabledFromEnv = parseBooleanEnv2(process.env.CTX_KNOWLEDGE_ENABLED);
      const ctxEnabledFromRuntime = parseBooleanEnv2(runtime.getSetting("CTX_KNOWLEDGE_ENABLED"));
      const ctxEnabledFromValidated = validatedConfig.CTX_KNOWLEDGE_ENABLED;
      const finalCtxEnabled = ctxEnabledFromValidated;
      logger6.debug(`[Knowledge Plugin] CTX_KNOWLEDGE_ENABLED sources:`);
      logger6.debug(`[Knowledge Plugin] - From env: ${ctxEnabledFromEnv}`);
      logger6.debug(`[Knowledge Plugin] - From runtime: ${ctxEnabledFromRuntime}`);
      logger6.debug(`[Knowledge Plugin] - FINAL RESULT: ${finalCtxEnabled}`);
      if (finalCtxEnabled) {
        logger6.info("Running in Contextual Knowledge mode with text generation capabilities.");
        logger6.info(
          `Using ${validatedConfig.EMBEDDING_PROVIDER || "auto-detected"} for embeddings and ${validatedConfig.TEXT_PROVIDER} for text generation.`
        );
        logger6.info(`Text model: ${validatedConfig.TEXT_MODEL}`);
      } else {
        const usingPluginOpenAI = !process.env.EMBEDDING_PROVIDER;
        logger6.warn(
          "Running in Basic Embedding mode - documents will NOT be enriched with context!"
        );
        logger6.info("To enable contextual enrichment:");
        logger6.info("   - Set CTX_KNOWLEDGE_ENABLED=true");
        logger6.info("   - Configure TEXT_PROVIDER (anthropic/openai/openrouter/google)");
        logger6.info("   - Configure TEXT_MODEL and API key");
        if (usingPluginOpenAI) {
          logger6.info("Using auto-detected configuration from plugin-openai for embeddings.");
        } else {
          logger6.info(
            `Using ${validatedConfig.EMBEDDING_PROVIDER} for embeddings with ${validatedConfig.TEXT_EMBEDDING_MODEL}.`
          );
        }
      }
      logger6.info("Model configuration validated successfully.");
      logger6.info(`Knowledge Plugin initialized for agent: ${runtime.character.name}`);
      logger6.info(
        "Knowledge Plugin initialized. Frontend panel should be discoverable via its public route."
      );
    } catch (error) {
      logger6.error({ error }, "Failed to initialize Knowledge plugin");
      throw error;
    }
    const service = new _KnowledgeService(runtime);
    service.config = validatedConfig;
    if (service.config.LOAD_DOCS_ON_STARTUP) {
      logger6.info("LOAD_DOCS_ON_STARTUP is enabled. Loading documents from docs folder...");
      service.loadInitialDocuments().catch((error) => {
        logger6.error({ error }, "Error during initial document loading in KnowledgeService");
      });
    } else {
      logger6.info("LOAD_DOCS_ON_STARTUP is disabled. Skipping automatic document loading.");
    }
    if (service.runtime.character?.knowledge && service.runtime.character.knowledge.length > 0) {
      logger6.info(
        `KnowledgeService: Processing ${service.runtime.character.knowledge.length} character knowledge items.`
      );
      const stringKnowledge = service.runtime.character.knowledge.filter(
        (item) => typeof item === "string"
      );
      await service.processCharacterKnowledge(stringKnowledge).catch((err) => {
        logger6.error(
          { error: err },
          "KnowledgeService: Error processing character knowledge during startup"
        );
      });
    } else {
      logger6.info(
        `KnowledgeService: No character knowledge to process for agent ${runtime.agentId}.`
      );
    }
    return service;
  }
  /**
   * Stop the Knowledge service
   * @param runtime Agent runtime
   */
  static async stop(runtime) {
    logger6.info(`Stopping Knowledge service for agent: ${runtime.agentId}`);
    const service = runtime.getService(_KnowledgeService.serviceType);
    if (!service) {
      logger6.warn(`KnowledgeService not found for agent ${runtime.agentId} during stop.`);
    }
    if (service instanceof _KnowledgeService) {
      await service.stop();
    }
  }
  /**
   * Stop the service
   */
  async stop() {
    logger6.info(`Knowledge service stopping for agent: ${this.runtime.character?.name}`);
  }
  /**
   * Add knowledge to the system
   * @param options Knowledge options
   * @returns Promise with document processing result
   */
  async addKnowledge(options) {
    const agentId = options.agentId || this.runtime.agentId;
    const contentBasedId = generateContentBasedId(options.content, agentId, {
      includeFilename: options.originalFilename,
      contentType: options.contentType,
      maxChars: 2e3
      // Use first 2KB of content for ID generation
    });
    logger6.info(`Processing "${options.originalFilename}" (${options.contentType})`);
    try {
      const existingDocument = await this.runtime.getMemoryById(contentBasedId);
      if (existingDocument && existingDocument.metadata?.type === MemoryType2.DOCUMENT) {
        logger6.info(`"${options.originalFilename}" already exists - skipping`);
        const fragments = await this.runtime.getMemories({
          tableName: "knowledge"
        });
        const relatedFragments = fragments.filter(
          (f) => f.metadata?.type === MemoryType2.FRAGMENT && f.metadata.documentId === contentBasedId
        );
        return {
          clientDocumentId: contentBasedId,
          storedDocumentMemoryId: existingDocument.id,
          fragmentCount: relatedFragments.length
        };
      }
    } catch (error) {
      logger6.debug(
        `Document ${contentBasedId} not found or error checking existence, proceeding with processing: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return this.processDocument({
      ...options,
      clientDocumentId: contentBasedId
    });
  }
  /**
   * Process a document regardless of type - Called by public addKnowledge
   * @param options Document options
   * @returns Promise with document processing result
   */
  async processDocument({
    agentId: passedAgentId,
    clientDocumentId,
    contentType,
    originalFilename,
    worldId,
    content,
    roomId,
    entityId,
    metadata
  }) {
    const agentId = passedAgentId || this.runtime.agentId;
    try {
      logger6.debug(
        `KnowledgeService: Processing document ${originalFilename} (type: ${contentType}) via processDocument for agent: ${agentId}`
      );
      let fileBuffer = null;
      let extractedText;
      let documentContentToStore;
      const isPdfFile = contentType === "application/pdf" || originalFilename.toLowerCase().endsWith(".pdf");
      if (isPdfFile) {
        try {
          fileBuffer = Buffer.from(content, "base64");
        } catch (e) {
          logger6.error(
            { error: e },
            `KnowledgeService: Failed to convert base64 to buffer for ${originalFilename}`
          );
          throw new Error(`Invalid base64 content for PDF file ${originalFilename}`);
        }
        extractedText = await extractTextFromDocument(fileBuffer, contentType, originalFilename);
        documentContentToStore = content;
      } else if (isBinaryContentType(contentType, originalFilename)) {
        try {
          fileBuffer = Buffer.from(content, "base64");
        } catch (e) {
          logger6.error(
            { error: e },
            `KnowledgeService: Failed to convert base64 to buffer for ${originalFilename}`
          );
          throw new Error(`Invalid base64 content for binary file ${originalFilename}`);
        }
        extractedText = await extractTextFromDocument(fileBuffer, contentType, originalFilename);
        documentContentToStore = extractedText;
      } else {
        if (looksLikeBase64(content)) {
          try {
            const decodedBuffer = Buffer.from(content, "base64");
            const decodedText = decodedBuffer.toString("utf8");
            const invalidCharCount = (decodedText.match(/\ufffd/g) || []).length;
            const textLength = decodedText.length;
            if (invalidCharCount > 0 && invalidCharCount / textLength > 0.1) {
              throw new Error("Decoded content contains too many invalid characters");
            }
            logger6.debug(`Successfully decoded base64 content for text file: ${originalFilename}`);
            extractedText = decodedText;
            documentContentToStore = decodedText;
          } catch (e) {
            logger6.error({ error: e }, `Failed to decode base64 for ${originalFilename}`);
            throw new Error(
              `File ${originalFilename} appears to be corrupted or incorrectly encoded`
            );
          }
        } else {
          logger6.debug(`Treating content as plain text for file: ${originalFilename}`);
          extractedText = content;
          documentContentToStore = content;
        }
      }
      if (!extractedText || extractedText.trim() === "") {
        const noTextError = new Error(
          `KnowledgeService: No text content extracted from ${originalFilename} (type: ${contentType}).`
        );
        logger6.warn(noTextError.message);
        throw noTextError;
      }
      const documentMemory = createDocumentMemory({
        text: documentContentToStore,
        // Store base64 only for PDFs, plain text for everything else
        agentId,
        clientDocumentId,
        // This becomes the memory.id
        originalFilename,
        contentType,
        worldId,
        fileSize: fileBuffer ? fileBuffer.length : extractedText.length,
        documentId: clientDocumentId,
        // Explicitly set documentId in metadata as well
        customMetadata: metadata
        // Pass the custom metadata
      });
      const memoryWithScope = {
        ...documentMemory,
        id: clientDocumentId,
        // Ensure the ID of the memory is the clientDocumentId
        agentId,
        roomId: roomId || agentId,
        entityId: entityId || agentId
      };
      logger6.debug(
        `KnowledgeService: Creating memory with agentId=${agentId}, entityId=${entityId}, roomId=${roomId}, this.runtime.agentId=${this.runtime.agentId}`
      );
      logger6.debug(
        `KnowledgeService: memoryWithScope agentId=${memoryWithScope.agentId}, entityId=${memoryWithScope.entityId}`
      );
      await this.runtime.createMemory(memoryWithScope, "documents");
      logger6.debug(
        `KnowledgeService: Stored document ${originalFilename} (Memory ID: ${memoryWithScope.id})`
      );
      const fragmentCount = await processFragmentsSynchronously({
        runtime: this.runtime,
        documentId: clientDocumentId,
        // Pass clientDocumentId to link fragments
        fullDocumentText: extractedText,
        agentId,
        contentType,
        roomId: roomId || agentId,
        entityId: entityId || agentId,
        worldId: worldId || agentId,
        documentTitle: originalFilename
      });
      logger6.debug(`"${originalFilename}" stored with ${fragmentCount} fragments`);
      return {
        clientDocumentId,
        storedDocumentMemoryId: memoryWithScope.id,
        fragmentCount
      };
    } catch (error) {
      logger6.error(
        { error, stack: error.stack },
        `KnowledgeService: Error processing document ${originalFilename}`
      );
      throw error;
    }
  }
  // --- Knowledge methods moved from AgentRuntime ---
  async handleProcessingError(error, context) {
    logger6.error({ error }, `KnowledgeService: Error ${context}`);
    throw error;
  }
  async checkExistingKnowledge(knowledgeId) {
    const existingDocument = await this.runtime.getMemoryById(knowledgeId);
    return !!existingDocument;
  }
  async getKnowledge(message, scope) {
    logger6.debug(`KnowledgeService: getKnowledge called for message id: ${message.id}`);
    if (!message?.content?.text || message?.content?.text.trim().length === 0) {
      logger6.warn("KnowledgeService: Invalid or empty message content for knowledge query.");
      return [];
    }
    const embedding = await this.runtime.useModel(ModelType2.TEXT_EMBEDDING, {
      text: message.content.text
    });
    const filterScope = {};
    if (scope?.roomId) filterScope.roomId = scope.roomId;
    if (scope?.worldId) filterScope.worldId = scope.worldId;
    if (scope?.entityId) filterScope.entityId = scope.entityId;
    const fragments = await this.runtime.searchMemories({
      tableName: "knowledge",
      embedding,
      query: message.content.text,
      ...filterScope,
      count: 20,
      match_threshold: 0.1
      // TODO: Make configurable
    });
    return fragments.filter((fragment) => fragment.id !== void 0).map((fragment) => ({
      id: fragment.id,
      // Cast as UUID after filtering
      content: fragment.content,
      // Cast if necessary, ensure Content type matches
      similarity: fragment.similarity,
      metadata: fragment.metadata,
      worldId: fragment.worldId
    }));
  }
  /**
   * Enrich a conversation memory with RAG metadata
   * This can be called after response generation to add RAG tracking data
   * @param memoryId The ID of the conversation memory to enrich
   * @param ragMetadata The RAG metadata to add
   */
  async enrichConversationMemoryWithRAG(memoryId, ragMetadata) {
    try {
      const existingMemory = await this.runtime.getMemoryById(memoryId);
      if (!existingMemory) {
        logger6.warn(`Cannot enrich memory ${memoryId} - memory not found`);
        return;
      }
      const updatedMetadata = {
        ...existingMemory.metadata,
        knowledgeUsed: true,
        // Simple flag for UI to detect RAG usage
        ragUsage: {
          retrievedFragments: ragMetadata.retrievedFragments,
          queryText: ragMetadata.queryText,
          totalFragments: ragMetadata.totalFragments,
          retrievalTimestamp: ragMetadata.retrievalTimestamp,
          usedInResponse: true
        },
        timestamp: existingMemory.metadata?.timestamp || Date.now(),
        type: existingMemory.metadata?.type || "message"
      };
      await this.runtime.updateMemory({
        id: memoryId,
        metadata: updatedMetadata
      });
      logger6.debug(
        `Enriched conversation memory ${memoryId} with RAG data: ${ragMetadata.totalFragments} fragments`
      );
    } catch (error) {
      logger6.warn(
        `Failed to enrich conversation memory ${memoryId} with RAG data: ${error.message}`
      );
    }
  }
  /**
   * Set the current response memory ID for RAG tracking
   * This is called by the knowledge provider to track which response memory to enrich
   */
  pendingRAGEnrichment = [];
  /**
   * Store RAG metadata for the next conversation memory that gets created
   * @param ragMetadata The RAG metadata to associate with the next memory
   */
  setPendingRAGMetadata(ragMetadata) {
    const now = Date.now();
    this.pendingRAGEnrichment = this.pendingRAGEnrichment.filter(
      (entry) => now - entry.timestamp < 3e4
    );
    this.pendingRAGEnrichment.push({
      ragMetadata,
      timestamp: now
    });
    logger6.debug(`Stored pending RAG metadata for next conversation memory`);
  }
  /**
   * Try to enrich recent conversation memories with pending RAG metadata
   * This is called periodically to catch memories that were created after RAG retrieval
   */
  async enrichRecentMemoriesWithPendingRAG() {
    if (this.pendingRAGEnrichment.length === 0) {
      return;
    }
    try {
      const recentMemories = await this.runtime.getMemories({
        tableName: "messages",
        count: 10
      });
      const now = Date.now();
      const recentConversationMemories = recentMemories.filter(
        (memory) => memory.metadata?.type === "message" && now - (memory.createdAt || 0) < 1e4 && // Created in last 10 seconds
        !memory.metadata?.ragUsage
        // Doesn't already have RAG data
      ).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      for (const pendingEntry of this.pendingRAGEnrichment) {
        const matchingMemory = recentConversationMemories.find(
          (memory) => (memory.createdAt || 0) > pendingEntry.timestamp
        );
        if (matchingMemory && matchingMemory.id) {
          await this.enrichConversationMemoryWithRAG(matchingMemory.id, pendingEntry.ragMetadata);
          const index = this.pendingRAGEnrichment.indexOf(pendingEntry);
          if (index > -1) {
            this.pendingRAGEnrichment.splice(index, 1);
          }
        }
      }
    } catch (error) {
      logger6.warn(`Error enriching recent memories with RAG data: ${error.message}`);
    }
  }
  async processCharacterKnowledge(items) {
    await new Promise((resolve2) => setTimeout(resolve2, 1e3));
    logger6.info(
      `KnowledgeService: Processing ${items.length} character knowledge items for agent ${this.runtime.agentId}`
    );
    const processingPromises = items.map(async (item) => {
      await this.knowledgeProcessingSemaphore.acquire();
      try {
        const knowledgeId = generateContentBasedId(item, this.runtime.agentId, {
          maxChars: 2e3,
          // Use first 2KB of content
          includeFilename: "character-knowledge"
          // A constant identifier for character knowledge
        });
        if (await this.checkExistingKnowledge(knowledgeId)) {
          logger6.debug(
            `KnowledgeService: Character knowledge item with ID ${knowledgeId} already exists. Skipping.`
          );
          return;
        }
        logger6.debug(
          `KnowledgeService: Processing character knowledge for ${this.runtime.character?.name} - ${item.slice(0, 100)}`
        );
        let metadata = {
          type: MemoryType2.DOCUMENT,
          // Character knowledge often represents a doc/fact.
          timestamp: Date.now(),
          source: "character"
          // Indicate the source
        };
        const pathMatch = item.match(/^Path: (.+?)(?:\n|\r\n)/);
        if (pathMatch) {
          const filePath = pathMatch[1].trim();
          const extension = filePath.split(".").pop() || "";
          const filename = filePath.split("/").pop() || "";
          const title = filename.replace(`.${extension}`, "");
          metadata = {
            ...metadata,
            path: filePath,
            filename,
            fileExt: extension,
            title,
            fileType: `text/${extension || "plain"}`,
            // Assume text if not specified
            fileSize: item.length
          };
        }
        await this._internalAddKnowledge(
          {
            id: knowledgeId,
            // Use the content-based ID
            content: {
              text: item
            },
            metadata
          },
          void 0,
          {
            // Scope to the agent itself for character knowledge
            roomId: this.runtime.agentId,
            entityId: this.runtime.agentId,
            worldId: this.runtime.agentId
          }
        );
      } catch (error) {
        await this.handleProcessingError(error, "processing character knowledge");
      } finally {
        this.knowledgeProcessingSemaphore.release();
      }
    });
    await Promise.all(processingPromises);
    logger6.info(
      `KnowledgeService: Finished processing character knowledge for agent ${this.runtime.agentId}.`
    );
  }
  async _internalAddKnowledge(item, options = {
    targetTokens: 1500,
    // TODO: Make these configurable, perhaps from plugin config
    overlap: 200,
    modelContextSize: 4096
  }, scope = {
    // Default scope for internal additions (like character knowledge)
    roomId: this.runtime.agentId,
    entityId: this.runtime.agentId,
    worldId: this.runtime.agentId
  }) {
    const finalScope = {
      roomId: scope?.roomId ?? this.runtime.agentId,
      worldId: scope?.worldId ?? this.runtime.agentId,
      entityId: scope?.entityId ?? this.runtime.agentId
    };
    logger6.debug(`KnowledgeService: _internalAddKnowledge called for item ID ${item.id}`);
    const documentMemory = {
      id: item.id,
      // This ID should be the unique ID for the document being added.
      agentId: this.runtime.agentId,
      roomId: finalScope.roomId,
      worldId: finalScope.worldId,
      entityId: finalScope.entityId,
      content: item.content,
      metadata: {
        ...item.metadata || {},
        // Spread existing metadata
        type: MemoryType2.DOCUMENT,
        // Ensure it's marked as a document
        documentId: item.id,
        // Ensure metadata.documentId is set to the item's ID
        timestamp: item.metadata?.timestamp || Date.now()
      },
      createdAt: Date.now()
    };
    const existingDocument = await this.runtime.getMemoryById(item.id);
    if (existingDocument) {
      logger6.debug(
        `KnowledgeService: Document ${item.id} already exists in _internalAddKnowledge, updating...`
      );
      await this.runtime.updateMemory({
        ...documentMemory,
        id: item.id
        // Ensure ID is passed for update
      });
    } else {
      await this.runtime.createMemory(documentMemory, "documents");
    }
    const fragments = await this.splitAndCreateFragments(
      item,
      // item.id is the documentId
      options.targetTokens,
      options.overlap,
      finalScope
    );
    let fragmentsProcessed = 0;
    for (const fragment of fragments) {
      try {
        await this.processDocumentFragment(fragment);
        fragmentsProcessed++;
      } catch (error) {
        logger6.error(
          { error },
          `KnowledgeService: Error processing fragment ${fragment.id} for document ${item.id}`
        );
      }
    }
    logger6.debug(
      `KnowledgeService: Processed ${fragmentsProcessed}/${fragments.length} fragments for document ${item.id}.`
    );
  }
  async processDocumentFragment(fragment) {
    try {
      await this.runtime.addEmbeddingToMemory(fragment);
      await this.runtime.createMemory(fragment, "knowledge");
    } catch (error) {
      logger6.error({ error }, `KnowledgeService: Error processing fragment ${fragment.id}`);
      throw error;
    }
  }
  async splitAndCreateFragments(document, targetTokens, overlap, scope) {
    if (!document.content.text) {
      return [];
    }
    const text = document.content.text;
    const chunks = await splitChunks2(text, targetTokens, overlap);
    return chunks.map((chunk, index) => {
      const fragmentIdContent = `${document.id}-fragment-${index}-${Date.now()}`;
      const fragmentId = createUniqueUuid(this.runtime, fragmentIdContent);
      return {
        id: fragmentId,
        entityId: scope.entityId,
        agentId: this.runtime.agentId,
        roomId: scope.roomId,
        worldId: scope.worldId,
        content: {
          text: chunk
        },
        metadata: {
          ...document.metadata || {},
          // Spread metadata from parent document
          type: MemoryType2.FRAGMENT,
          documentId: document.id,
          // Link fragment to parent document
          position: index,
          timestamp: Date.now()
          // Fragment's own creation timestamp
          // Ensure we don't overwrite essential fragment metadata with document's
          // For example, source might be different or more specific for the fragment.
          // Here, we primarily inherit and then set fragment-specifics.
        },
        createdAt: Date.now()
      };
    });
  }
  // ADDED METHODS START
  /**
   * Retrieves memories, typically documents, for the agent.
   * Corresponds to GET /plugins/knowledge/documents
   */
  async getMemories(params) {
    return this.runtime.getMemories({
      ...params,
      // includes tableName, roomId, count, offset, end
      agentId: this.runtime.agentId
    });
  }
  /**
   * Counts memories for pagination.
   * Corresponds to counting documents or fragments.
   */
  async countMemories(params) {
    const roomId = params.roomId || this.runtime.agentId;
    const unique = params.unique ?? false;
    const tableName = params.tableName;
    return this.runtime.countMemories(roomId, unique, tableName);
  }
  /**
   * Deletes a specific memory item (knowledge document) by its ID.
   * Corresponds to DELETE /plugins/knowledge/documents/:knowledgeId
   * Assumes the memoryId corresponds to an item in the 'documents' table or that
   * runtime.deleteMemory can correctly identify it.
   */
  async deleteMemory(memoryId) {
    await this.runtime.deleteMemory(memoryId);
    logger6.info(
      `KnowledgeService: Deleted memory ${memoryId} for agent ${this.runtime.agentId}. Assumed it was a document or related fragment.`
    );
  }
  // ADDED METHODS END
};

// src/provider.ts
import { addHeader, logger as logger7 } from "@elizaos/core";
var knowledgeProvider = {
  name: "KNOWLEDGE",
  description: "Knowledge from the knowledge base that the agent knows, retrieved whenever the agent needs to answer a question about their expertise.",
  dynamic: true,
  get: async (runtime, message) => {
    const knowledgeService = runtime.getService("knowledge");
    const knowledgeData = await knowledgeService?.getKnowledge(message);
    const firstFiveKnowledgeItems = knowledgeData?.slice(0, 5);
    let knowledge = (firstFiveKnowledgeItems && firstFiveKnowledgeItems.length > 0 ? addHeader(
      "# Knowledge",
      firstFiveKnowledgeItems.map((knowledge2) => `- ${knowledge2.content.text}`).join("\n")
    ) : "") + "\n";
    const tokenLength = 3.5;
    if (knowledge.length > 4e3 * tokenLength) {
      knowledge = knowledge.slice(0, 4e3 * tokenLength);
    }
    let ragMetadata = null;
    if (knowledgeData && knowledgeData.length > 0) {
      ragMetadata = {
        retrievedFragments: knowledgeData.map((fragment) => ({
          fragmentId: fragment.id,
          documentTitle: fragment.metadata?.filename || fragment.metadata?.title || "Unknown Document",
          similarityScore: fragment.similarity,
          contentPreview: (fragment.content?.text || "No content").substring(0, 100) + "..."
        })),
        queryText: message.content?.text || "Unknown query",
        totalFragments: knowledgeData.length,
        retrievalTimestamp: Date.now()
      };
    }
    if (knowledgeData && knowledgeData.length > 0 && knowledgeService && ragMetadata) {
      try {
        knowledgeService.setPendingRAGMetadata(ragMetadata);
        setTimeout(async () => {
          try {
            await knowledgeService.enrichRecentMemoriesWithPendingRAG();
          } catch (error) {
            logger7.warn("RAG memory enrichment failed:", error.message);
          }
        }, 2e3);
      } catch (error) {
        logger7.warn("RAG memory enrichment failed:", error.message);
      }
    }
    return {
      data: {
        knowledge,
        ragMetadata,
        // 🎯 Include RAG metadata for memory tracking
        knowledgeUsed: knowledgeData && knowledgeData.length > 0
        // Simple flag for easy detection
      },
      values: {
        knowledge,
        knowledgeUsed: knowledgeData && knowledgeData.length > 0
        // Simple flag for easy detection
      },
      text: knowledge,
      ragMetadata,
      // 🎯 Also include at top level for easy access
      knowledgeUsed: knowledgeData && knowledgeData.length > 0
      // 🎯 Simple flag at top level too
    };
  }
};

// src/documents-provider.ts
import { addHeader as addHeader2, logger as logger8, MemoryType as MemoryType3 } from "@elizaos/core";
var documentsProvider = {
  name: "AVAILABLE_DOCUMENTS",
  description: "List of documents available in the knowledge base. Shows which documents the agent can reference and retrieve information from.",
  dynamic: false,
  // Static provider - doesn't change based on the message
  get: async (runtime) => {
    try {
      const knowledgeService = runtime.getService("knowledge");
      if (!knowledgeService) {
        logger8.warn("Knowledge service not available for documents provider");
        return {
          data: { documents: [] },
          values: { documents: "" },
          text: ""
        };
      }
      const allMemories = await knowledgeService.getMemories({
        tableName: "documents",
        roomId: runtime.agentId,
        count: 100
        // Limit to 100 documents to avoid context overflow
      });
      const documents = allMemories.filter(
        (memory) => memory.metadata?.type === MemoryType3.DOCUMENT
      );
      if (!documents || documents.length === 0) {
        return {
          data: { documents: [] },
          values: { documents: "" },
          text: ""
        };
      }
      const documentsList = documents.map((doc, index) => {
        const metadata = doc.metadata;
        const filename = metadata?.filename || metadata?.title || `Document ${index + 1}`;
        const fileType = metadata?.fileExt || metadata?.fileType || "unknown";
        const source = metadata?.source || "upload";
        const fileSize = metadata?.fileSize;
        const parts = [filename];
        if (fileType && fileType !== "unknown") {
          parts.push(fileType);
        }
        if (fileSize) {
          const sizeKB = Math.round(fileSize / 1024);
          if (sizeKB > 1024) {
            parts.push(`${Math.round(sizeKB / 1024)}MB`);
          } else {
            parts.push(`${sizeKB}KB`);
          }
        }
        if (source && source !== "upload") {
          parts.push(`from ${source}`);
        }
        return parts.join(" - ");
      }).join("\n");
      const documentsText = addHeader2(
        "# Available Documents",
        `${documents.length} document(s) in knowledge base:
${documentsList}`
      );
      return {
        data: {
          documents: documents.map((doc) => ({
            id: doc.id,
            filename: doc.metadata?.filename || doc.metadata?.title,
            fileType: doc.metadata?.fileType || doc.metadata?.fileExt,
            source: doc.metadata?.source
          })),
          count: documents.length
        },
        values: {
          documentsCount: documents.length,
          documents: documentsList
        },
        text: documentsText
      };
    } catch (error) {
      logger8.error("Error in documents provider:", error.message);
      return {
        data: { documents: [], error: error.message },
        values: { documents: "" },
        text: ""
      };
    }
  }
};

// src/tests.ts
import { MemoryType as MemoryType4, ModelType as ModelType3 } from "@elizaos/core";
import { Buffer as Buffer3 } from "buffer";
import * as fs2 from "fs";
import * as path2 from "path";
var mockLogger = {
  info: (() => {
    const fn = (...args) => {
      fn.calls.push(args);
    };
    fn.calls = [];
    return fn;
  })(),
  warn: (() => {
    const fn = (...args) => {
      fn.calls.push(args);
    };
    fn.calls = [];
    return fn;
  })(),
  error: (() => {
    const fn = (...args) => {
      fn.calls.push(args);
    };
    fn.calls = [];
    return fn;
  })(),
  debug: (() => {
    const fn = (...args) => {
      fn.calls.push(args);
    };
    fn.calls = [];
    return fn;
  })(),
  success: (() => {
    const fn = (...args) => {
      fn.calls.push(args);
    };
    fn.calls = [];
    return fn;
  })(),
  clearCalls: () => {
    mockLogger.info.calls = [];
    mockLogger.warn.calls = [];
    mockLogger.error.calls = [];
    mockLogger.debug.calls = [];
    mockLogger.success.calls = [];
  }
};
global.logger = mockLogger;
function createMockRuntime(overrides) {
  const memories = /* @__PURE__ */ new Map();
  const services = /* @__PURE__ */ new Map();
  return {
    agentId: v4_default(),
    character: {
      name: "Test Agent",
      bio: ["Test bio"],
      knowledge: []
    },
    providers: [],
    actions: [],
    evaluators: [],
    plugins: [],
    services,
    events: /* @__PURE__ */ new Map(),
    // Database methods
    async init() {
    },
    async close() {
    },
    async getConnection() {
      return null;
    },
    async getAgent(agentId) {
      return null;
    },
    async getAgents() {
      return [];
    },
    async createAgent(agent) {
      return true;
    },
    async updateAgent(agentId, agent) {
      return true;
    },
    async deleteAgent(agentId) {
      return true;
    },
    async ensureAgentExists(agent) {
      return agent;
    },
    async ensureEmbeddingDimension(dimension) {
    },
    async getEntityById(entityId) {
      return null;
    },
    async getEntitiesForRoom(roomId) {
      return [];
    },
    async createEntity(entity) {
      return true;
    },
    async updateEntity(entity) {
    },
    async getComponent(entityId, type) {
      return null;
    },
    async getComponents(entityId) {
      return [];
    },
    async createComponent(component) {
      return true;
    },
    async updateComponent(component) {
    },
    async deleteComponent(componentId) {
    },
    // Memory methods with mock implementation
    async getMemoryById(id) {
      return memories.get(id) || null;
    },
    async getMemories(params) {
      const results = Array.from(memories.values()).filter((m) => {
        if (params.roomId && m.roomId !== params.roomId) return false;
        if (params.entityId && m.entityId !== params.entityId) return false;
        if (params.tableName === "knowledge" && m.metadata?.type !== MemoryType4.FRAGMENT)
          return false;
        if (params.tableName === "documents" && m.metadata?.type !== MemoryType4.DOCUMENT)
          return false;
        return true;
      });
      return params.count ? results.slice(0, params.count) : results;
    },
    async getMemoriesByIds(ids) {
      return ids.map((id) => memories.get(id)).filter(Boolean);
    },
    async getMemoriesByRoomIds(params) {
      return Array.from(memories.values()).filter((m) => params.roomIds.includes(m.roomId));
    },
    async searchMemories(params) {
      const fragments = Array.from(memories.values()).filter(
        (m) => m.metadata?.type === MemoryType4.FRAGMENT
      );
      return fragments.map((f) => ({
        ...f,
        similarity: 0.8 + Math.random() * 0.2
        // Mock similarity between 0.8 and 1.0
      })).slice(0, params.count || 10);
    },
    async createMemory(memory, tableName) {
      const id = memory.id || v4_default();
      const memoryWithId = { ...memory, id };
      memories.set(id, memoryWithId);
      return id;
    },
    async updateMemory(memory) {
      if (memory.id && memories.has(memory.id)) {
        memories.set(memory.id, { ...memories.get(memory.id), ...memory });
        return true;
      }
      return false;
    },
    async deleteMemory(memoryId) {
      memories.delete(memoryId);
    },
    async deleteAllMemories(roomId, tableName) {
      for (const [id, memory] of memories.entries()) {
        if (memory.roomId === roomId) {
          memories.delete(id);
        }
      }
    },
    async countMemories(roomId) {
      return Array.from(memories.values()).filter((m) => m.roomId === roomId).length;
    },
    // Other required methods with minimal implementation
    async getCachedEmbeddings(params) {
      return [];
    },
    async log(params) {
    },
    async getLogs(params) {
      return [];
    },
    async deleteLog(logId) {
    },
    async createWorld(world) {
      return v4_default();
    },
    async getWorld(id) {
      return null;
    },
    async removeWorld(id) {
    },
    async getAllWorlds() {
      return [];
    },
    async updateWorld(world) {
    },
    async getRoom(roomId) {
      return null;
    },
    async createRoom(room) {
      return v4_default();
    },
    async deleteRoom(roomId) {
    },
    async deleteRoomsByWorldId(worldId) {
    },
    async updateRoom(room) {
    },
    async getRoomsForParticipant(entityId) {
      return [];
    },
    async getRoomsForParticipants(userIds) {
      return [];
    },
    async getRooms(worldId) {
      return [];
    },
    async addParticipant(entityId, roomId) {
      return true;
    },
    async removeParticipant(entityId, roomId) {
      return true;
    },
    async getParticipantsForEntity(entityId) {
      return [];
    },
    async getParticipantsForRoom(roomId) {
      return [];
    },
    async getParticipantUserState(roomId, entityId) {
      return null;
    },
    async setParticipantUserState(roomId, entityId, state) {
    },
    async createRelationship(params) {
      return true;
    },
    async updateRelationship(relationship) {
    },
    async getRelationship(params) {
      return null;
    },
    async getRelationships(params) {
      return [];
    },
    async getCache(key) {
      return void 0;
    },
    async setCache(key, value) {
      return true;
    },
    async deleteCache(key) {
      return true;
    },
    async createTask(task) {
      return v4_default();
    },
    async getTasks(params) {
      return [];
    },
    async getTask(id) {
      return null;
    },
    async getTasksByName(name) {
      return [];
    },
    async updateTask(id, task) {
    },
    async deleteTask(id) {
    },
    async getMemoriesByWorldId(params) {
      return [];
    },
    // Plugin/service methods
    async registerPlugin(plugin) {
    },
    async initialize() {
    },
    getService(name) {
      return services.get(name) || null;
    },
    getAllServices() {
      return services;
    },
    async registerService(ServiceClass) {
      const service = await ServiceClass.start(this);
      services.set(ServiceClass.serviceType, service);
    },
    registerDatabaseAdapter(adapter) {
    },
    setSetting(key, value) {
    },
    getSetting(key) {
      return null;
    },
    getConversationLength() {
      return 0;
    },
    async processActions(message, responses) {
    },
    async evaluate(message) {
      return null;
    },
    registerProvider(provider) {
      this.providers.push(provider);
    },
    registerAction(action) {
    },
    registerEvaluator(evaluator) {
    },
    async ensureConnection(params) {
    },
    async ensureParticipantInRoom(entityId, roomId) {
    },
    async ensureWorldExists(world) {
    },
    async ensureRoomExists(room) {
    },
    async composeState(message) {
      return {
        values: {},
        data: {},
        text: ""
      };
    },
    // Model methods with mocks
    async useModel(modelType, params) {
      if (modelType === ModelType3.TEXT_EMBEDDING) {
        return new Array(1536).fill(0).map(() => Math.random());
      }
      if (modelType === ModelType3.TEXT_LARGE || modelType === ModelType3.TEXT_SMALL) {
        return `Mock response for: ${params.prompt}`;
      }
      return null;
    },
    registerModel(modelType, handler, provider) {
    },
    getModel(modelType) {
      return void 0;
    },
    registerEvent(event, handler) {
    },
    getEvent(event) {
      return void 0;
    },
    async emitEvent(event, params) {
    },
    registerTaskWorker(taskHandler) {
    },
    getTaskWorker(name) {
      return void 0;
    },
    async stop() {
    },
    async addEmbeddingToMemory(memory) {
      memory.embedding = await this.useModel(ModelType3.TEXT_EMBEDDING, {
        text: memory.content.text
      });
      return memory;
    },
    registerSendHandler(source, handler) {
    },
    async sendMessageToTarget(target, content) {
    },
    ...overrides
  };
}
function createTestFileBuffer(content, type = "text") {
  if (type === "pdf") {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${content.length + 10} >>
stream
BT /F1 12 Tf 100 700 Td (${content}) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000362 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${465 + content.length}
%%EOF`;
    return Buffer3.from(pdfContent);
  }
  return Buffer3.from(content, "utf-8");
}
var KnowledgeTestSuite = class {
  name = "knowledge";
  description = "Tests for the Knowledge plugin including document processing, retrieval, and integration";
  tests = [
    // Configuration Tests
    {
      name: "Should handle default docs folder configuration",
      fn: async (runtime) => {
        const originalEnv = { ...process.env };
        delete process.env.KNOWLEDGE_PATH;
        try {
          const docsPath = path2.join(process.cwd(), "docs");
          const docsExists = fs2.existsSync(docsPath);
          if (!docsExists) {
            fs2.mkdirSync(docsPath, { recursive: true });
          }
          await index_default.init({}, runtime);
          const errorCalls = mockLogger.error.calls;
          if (errorCalls.length > 0) {
            throw new Error(`Unexpected error during init: ${errorCalls[0]}`);
          }
          if (!docsExists) {
            fs2.rmSync(docsPath, { recursive: true, force: true });
          }
        } finally {
          process.env = originalEnv;
        }
      }
    },
    {
      name: "Should throw error when no docs folder and no path configured",
      fn: async (runtime) => {
        const originalEnv = { ...process.env };
        delete process.env.KNOWLEDGE_PATH;
        try {
          const docsPath = path2.join(process.cwd(), "docs");
          if (fs2.existsSync(docsPath)) {
            fs2.renameSync(docsPath, docsPath + ".backup");
          }
          await index_default.init({}, runtime);
          if (fs2.existsSync(docsPath + ".backup")) {
            fs2.renameSync(docsPath + ".backup", docsPath);
          }
        } finally {
          process.env = originalEnv;
        }
      }
    },
    // Service Lifecycle Tests
    {
      name: "Should initialize KnowledgeService correctly",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        if (!service) {
          throw new Error("Service initialization failed");
        }
        if (service.capabilityDescription !== "Provides Retrieval Augmented Generation capabilities, including knowledge upload and querying.") {
          throw new Error("Incorrect service capability description");
        }
        runtime.services.set(KnowledgeService.serviceType, [service]);
        const retrievedService = runtime.getService(KnowledgeService.serviceType);
        if (retrievedService !== service) {
          throw new Error("Service not properly registered with runtime");
        }
        await service.stop();
      }
    },
    // Document Processing Tests
    {
      name: "Should extract text from text files",
      fn: async (runtime) => {
        const testContent = "This is a test document with some content.";
        const buffer = createTestFileBuffer(testContent);
        const extractedText = await extractTextFromDocument(buffer, "text/plain", "test.txt");
        if (extractedText !== testContent) {
          throw new Error(`Expected "${testContent}", got "${extractedText}"`);
        }
      }
    },
    {
      name: "Should handle empty file buffer",
      fn: async (runtime) => {
        const emptyBuffer = Buffer3.alloc(0);
        try {
          await extractTextFromDocument(emptyBuffer, "text/plain", "empty.txt");
          throw new Error("Should have thrown error for empty buffer");
        } catch (error) {
          if (!error.message.includes("Empty file buffer")) {
            throw new Error(`Unexpected error: ${error.message}`);
          }
        }
      }
    },
    {
      name: "Should create document memory correctly",
      fn: async (runtime) => {
        const params = {
          text: "Test document content",
          agentId: runtime.agentId,
          clientDocumentId: v4_default(),
          originalFilename: "test-doc.txt",
          contentType: "text/plain",
          worldId: v4_default(),
          fileSize: 1024
        };
        const memory = createDocumentMemory(params);
        if (!memory.id) {
          throw new Error("Document memory should have an ID");
        }
        if (memory.metadata?.type !== MemoryType4.DOCUMENT) {
          throw new Error("Document memory should have DOCUMENT type");
        }
        if (memory.content.text !== params.text) {
          throw new Error("Document memory content mismatch");
        }
        if (memory.metadata.originalFilename !== params.originalFilename) {
          throw new Error("Document memory metadata mismatch");
        }
      }
    },
    // Knowledge Addition Tests
    {
      name: "Should add knowledge successfully",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        runtime.services.set(KnowledgeService.serviceType, [service]);
        const testDocument = {
          clientDocumentId: v4_default(),
          contentType: "text/plain",
          originalFilename: "knowledge-test.txt",
          worldId: runtime.agentId,
          content: "This is test knowledge that should be stored and retrievable.",
          roomId: runtime.agentId,
          entityId: runtime.agentId
        };
        const result = await service.addKnowledge(testDocument);
        if (result.clientDocumentId !== testDocument.clientDocumentId) {
          throw new Error("Client document ID mismatch");
        }
        if (!result.storedDocumentMemoryId) {
          throw new Error("No stored document memory ID returned");
        }
        if (result.fragmentCount === 0) {
          throw new Error("No fragments created");
        }
        const storedDoc = await runtime.getMemoryById(result.storedDocumentMemoryId);
        if (!storedDoc) {
          throw new Error("Document not found in storage");
        }
        await service.stop();
      }
    },
    {
      name: "Should handle duplicate document uploads",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        runtime.services.set(KnowledgeService.serviceType, [service]);
        const testDocument = {
          clientDocumentId: v4_default(),
          contentType: "text/plain",
          originalFilename: "duplicate-test.txt",
          worldId: runtime.agentId,
          content: "This document will be uploaded twice.",
          roomId: runtime.agentId,
          entityId: runtime.agentId
        };
        const result1 = await service.addKnowledge(testDocument);
        const result2 = await service.addKnowledge(testDocument);
        if (result1.storedDocumentMemoryId !== result2.storedDocumentMemoryId) {
          throw new Error("Duplicate upload created new document");
        }
        if (result1.fragmentCount !== result2.fragmentCount) {
          throw new Error("Fragment count mismatch on duplicate upload");
        }
        await service.stop();
      }
    },
    // Knowledge Retrieval Tests
    {
      name: "Should retrieve knowledge based on query",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        runtime.services.set(KnowledgeService.serviceType, [service]);
        const testDocument = {
          clientDocumentId: v4_default(),
          contentType: "text/plain",
          originalFilename: "retrieval-test.txt",
          worldId: runtime.agentId,
          content: "The capital of France is Paris. Paris is known for the Eiffel Tower.",
          roomId: runtime.agentId,
          entityId: runtime.agentId
        };
        await service.addKnowledge(testDocument);
        const queryMessage = {
          id: v4_default(),
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          roomId: runtime.agentId,
          content: {
            text: "What is the capital of France?"
          }
        };
        const results = await service.getKnowledge(queryMessage);
        if (results.length === 0) {
          throw new Error("No knowledge retrieved");
        }
        const hasRelevantContent = results.some(
          (item) => item.content.text?.toLowerCase().includes("paris") || item.content.text?.toLowerCase().includes("france")
        );
        if (!hasRelevantContent) {
          throw new Error("Retrieved knowledge not relevant to query");
        }
        await service.stop();
      }
    },
    // Provider Tests
    {
      name: "Should format knowledge in provider output",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        runtime.services.set("knowledge", [service]);
        const testDocument = {
          clientDocumentId: v4_default(),
          contentType: "text/plain",
          originalFilename: "provider-test.txt",
          worldId: runtime.agentId,
          content: "Important fact 1. Important fact 2. Important fact 3.",
          roomId: runtime.agentId,
          entityId: runtime.agentId
        };
        await service.addKnowledge(testDocument);
        const message = {
          id: v4_default(),
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          roomId: runtime.agentId,
          content: {
            text: "Tell me about important facts"
          }
        };
        const originalGetKnowledge = service.getKnowledge.bind(service);
        service.getKnowledge = async (msg) => {
          return [
            {
              id: v4_default(),
              content: { text: "Important fact 1." },
              metadata: void 0
            },
            {
              id: v4_default(),
              content: { text: "Important fact 2." },
              metadata: void 0
            }
          ];
        };
        const state = {
          values: {},
          data: {},
          text: ""
        };
        const result = await knowledgeProvider.get(runtime, message, state);
        if (!result.text) {
          throw new Error("Provider returned no text");
        }
        if (!result.text.includes("# Knowledge")) {
          throw new Error("Provider output missing knowledge header");
        }
        if (!result.text.includes("Important fact")) {
          throw new Error("Provider output missing knowledge content");
        }
        service.getKnowledge = originalGetKnowledge;
        await service.stop();
      }
    },
    // Character Knowledge Tests
    {
      name: "Should process character knowledge on startup",
      fn: async (runtime) => {
        const knowledgeRuntime = createMockRuntime({
          character: {
            name: "Knowledge Agent",
            bio: ["Agent with knowledge"],
            knowledge: [
              "The sky is blue.",
              "Water boils at 100 degrees Celsius.",
              "Path: docs/test.md\nThis is markdown content."
            ]
          }
        });
        const service = await KnowledgeService.start(knowledgeRuntime);
        await new Promise((resolve2) => setTimeout(resolve2, 2e3));
        const memories = await knowledgeRuntime.getMemories({
          tableName: "documents",
          entityId: knowledgeRuntime.agentId
        });
        if (memories.length < 3) {
          throw new Error(`Expected at least 3 character knowledge items, got ${memories.length}`);
        }
        const pathKnowledge = memories.find((m) => m.content.text?.includes("markdown content"));
        if (!pathKnowledge) {
          throw new Error("Path-based knowledge not found");
        }
        const metadata = pathKnowledge.metadata;
        if (!metadata.path || !metadata.filename) {
          throw new Error("Path-based knowledge missing file metadata");
        }
        await service.stop();
      }
    },
    // Error Handling Tests
    {
      name: "Should handle and log errors appropriately",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        runtime.services.set(KnowledgeService.serviceType, [service]);
        mockLogger.clearCalls();
        try {
          await service.addKnowledge({
            clientDocumentId: v4_default(),
            contentType: "text/plain",
            originalFilename: "empty.txt",
            worldId: runtime.agentId,
            content: "",
            // Empty content should cause an error
            roomId: runtime.agentId,
            entityId: runtime.agentId
          });
          throw new Error("Expected error for empty content");
        } catch (error) {
          if (!error.message.includes("Empty file buffer") && !error.message.includes("Expected error for empty content")) {
          }
        }
        try {
          await service.addKnowledge({
            clientDocumentId: v4_default(),
            contentType: "text/plain",
            originalFilename: "null-content.txt",
            worldId: runtime.agentId,
            content: null,
            // This should definitely cause an error
            roomId: runtime.agentId,
            entityId: runtime.agentId
          });
        } catch (error) {
        }
        await service.stop();
      }
    },
    // Integration Tests
    {
      name: "End-to-end knowledge workflow test",
      fn: async (runtime) => {
        await index_default.init(
          {
            EMBEDDING_PROVIDER: "openai",
            OPENAI_API_KEY: "test-key",
            TEXT_EMBEDDING_MODEL: "text-embedding-3-small"
          },
          runtime
        );
        const service = await KnowledgeService.start(runtime);
        runtime.services.set(KnowledgeService.serviceType, [service]);
        runtime.services.set("knowledge", [service]);
        runtime.registerProvider(knowledgeProvider);
        const document = {
          clientDocumentId: v4_default(),
          contentType: "text/plain",
          originalFilename: "integration-test.txt",
          worldId: runtime.agentId,
          content: `
            Quantum computing uses quantum bits or qubits.
            Unlike classical bits, qubits can exist in superposition.
            This allows quantum computers to process many calculations simultaneously.
            Major companies like IBM, Google, and Microsoft are developing quantum computers.
          `,
          roomId: runtime.agentId,
          entityId: runtime.agentId
        };
        const addResult = await service.addKnowledge(document);
        if (addResult.fragmentCount === 0) {
          throw new Error("No fragments created in integration test");
        }
        const queryMessage = {
          id: v4_default(),
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          roomId: runtime.agentId,
          content: {
            text: "What are qubits?"
          }
        };
        const knowledge = await service.getKnowledge(queryMessage);
        if (knowledge.length === 0) {
          throw new Error("No knowledge retrieved in integration test");
        }
        const state = {
          values: {},
          data: {},
          text: ""
        };
        const providerResult = await knowledgeProvider.get(runtime, queryMessage, state);
        if (!providerResult.text || !providerResult.text.includes("qubit")) {
          throw new Error("Provider did not return relevant knowledge");
        }
        if (!providerResult.values || !providerResult.values.knowledge || !providerResult.data || !providerResult.data.knowledge) {
          throw new Error("Provider result missing knowledge in values/data");
        }
        await service.stop();
      }
    },
    // Performance and Limits Tests
    {
      name: "Should handle large documents with chunking",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        runtime.services.set(KnowledgeService.serviceType, [service]);
        const largeContent = Array(100).fill(
          "This is a paragraph of text that will be repeated many times to create a large document for testing chunking functionality. "
        ).join("\n\n");
        const document = {
          clientDocumentId: v4_default(),
          contentType: "text/plain",
          originalFilename: "large-document.txt",
          worldId: runtime.agentId,
          content: largeContent,
          roomId: runtime.agentId,
          entityId: runtime.agentId
        };
        const result = await service.addKnowledge(document);
        if (result.fragmentCount < 2) {
          throw new Error("Large document should be split into multiple fragments");
        }
        const fragments = await runtime.getMemories({
          tableName: "knowledge",
          roomId: runtime.agentId
        });
        const documentFragments = fragments.filter(
          (f) => f.metadata?.documentId === document.clientDocumentId
        );
        if (documentFragments.length !== result.fragmentCount) {
          throw new Error("Fragment count mismatch");
        }
        await service.stop();
      }
    },
    // Binary File Handling Tests
    {
      name: "Should detect binary content types correctly",
      fn: async (runtime) => {
        const service = await KnowledgeService.start(runtime);
        const binaryTypes = [
          { type: "application/pdf", filename: "test.pdf", expected: true },
          { type: "image/png", filename: "test.png", expected: true },
          {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename: "test.docx",
            expected: true
          },
          { type: "text/plain", filename: "test.txt", expected: false },
          { type: "application/json", filename: "test.tson", expected: false },
          {
            type: "application/octet-stream",
            filename: "unknown.bin",
            expected: true
          }
        ];
        for (const test of binaryTypes) {
          const result = isBinaryContentType(test.type, test.filename);
          if (result !== test.expected) {
            throw new Error(
              `Binary detection failed for ${test.type}/${test.filename}. Expected ${test.expected}, got ${result}`
            );
          }
        }
        await service.stop();
      }
    }
  ];
};
var tests_default = new KnowledgeTestSuite();

// src/actions.ts
import { logger as logger9, stringToUuid } from "@elizaos/core";
import * as fs3 from "fs";
import * as path3 from "path";
var processKnowledgeAction = {
  name: "PROCESS_KNOWLEDGE",
  description: "Process and store knowledge from a file path or text content into the knowledge base",
  similes: [],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Process the document at /path/to/document.pdf"
        }
      },
      {
        name: "assistant",
        content: {
          text: "I'll process the document at /path/to/document.pdf and add it to my knowledge base.",
          actions: ["PROCESS_KNOWLEDGE"]
        }
      }
    ],
    [
      {
        name: "user",
        content: {
          text: "Add this to your knowledge: The capital of France is Paris."
        }
      },
      {
        name: "assistant",
        content: {
          text: "I'll add that information to my knowledge base.",
          actions: ["PROCESS_KNOWLEDGE"]
        }
      }
    ]
  ],
  validate: async (runtime, message, state) => {
    const text = message.content.text?.toLowerCase() || "";
    const knowledgeKeywords = [
      "process",
      "add",
      "upload",
      "document",
      "knowledge",
      "learn",
      "remember",
      "store",
      "ingest",
      "file"
    ];
    const hasKeyword = knowledgeKeywords.some((keyword) => text.includes(keyword));
    const pathPattern = /(?:\/[\w.-]+)+|(?:[a-zA-Z]:[\\/][\w\s.-]+(?:[\\/][\w\s.-]+)*)/;
    const hasPath = pathPattern.test(text);
    const service = runtime.getService(KnowledgeService.serviceType);
    if (!service) {
      logger9.warn("Knowledge service not available for PROCESS_KNOWLEDGE action");
      return false;
    }
    return hasKeyword || hasPath;
  },
  handler: async (runtime, message, state, options, callback) => {
    try {
      const service = runtime.getService(KnowledgeService.serviceType);
      if (!service) {
        throw new Error("Knowledge service not available");
      }
      const text = message.content.text || "";
      const pathPattern = /(?:\/[\w.-]+)+|(?:[a-zA-Z]:[\\/][\w\s.-]+(?:[\\/][\w\s.-]+)*)/;
      const pathMatch = text.match(pathPattern);
      let response;
      if (pathMatch) {
        const filePath = pathMatch[0];
        if (!fs3.existsSync(filePath)) {
          response = {
            text: `I couldn't find the file at ${filePath}. Please check the path and try again.`
          };
          if (callback) {
            await callback(response);
          }
          return;
        }
        const fileBuffer = fs3.readFileSync(filePath);
        const fileName = path3.basename(filePath);
        const fileExt = path3.extname(filePath).toLowerCase();
        let contentType = "text/plain";
        if (fileExt === ".pdf") contentType = "application/pdf";
        else if (fileExt === ".docx")
          contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (fileExt === ".doc") contentType = "application/msword";
        else if ([".txt", ".md", ".tson", ".xml", ".csv"].includes(fileExt))
          contentType = "text/plain";
        const knowledgeOptions = {
          clientDocumentId: stringToUuid(runtime.agentId + fileName + Date.now()),
          contentType,
          originalFilename: fileName,
          worldId: runtime.agentId,
          content: fileBuffer.toString("base64"),
          roomId: message.roomId,
          entityId: message.entityId
        };
        const result = await service.addKnowledge(knowledgeOptions);
        response = {
          text: `I've successfully processed the document "${fileName}". It has been split into ${result?.fragmentCount || 0} searchable fragments and added to my knowledge base.`
        };
      } else {
        const knowledgeContent = text.replace(/^(add|store|remember|process|learn)\s+(this|that|the following)?:?\s*/i, "").trim();
        if (!knowledgeContent) {
          response = {
            text: "I need some content to add to my knowledge base. Please provide text or a file path."
          };
          if (callback) {
            await callback(response);
          }
          return;
        }
        const knowledgeOptions = {
          clientDocumentId: stringToUuid(runtime.agentId + "text" + Date.now() + "user-knowledge"),
          contentType: "text/plain",
          originalFilename: "user-knowledge.txt",
          worldId: runtime.agentId,
          content: knowledgeContent,
          roomId: message.roomId,
          entityId: message.entityId
        };
        await service.addKnowledge(knowledgeOptions);
        response = {
          text: `I've added that information to my knowledge base. It has been stored and indexed for future reference.`
        };
      }
      if (callback) {
        await callback(response);
      }
    } catch (error) {
      logger9.error({ error }, "Error in PROCESS_KNOWLEDGE action");
      const errorResponse = {
        text: `I encountered an error while processing the knowledge: ${error instanceof Error ? error.message : "Unknown error"}`
      };
      if (callback) {
        await callback(errorResponse);
      }
    }
  }
};
var searchKnowledgeAction = {
  name: "SEARCH_KNOWLEDGE",
  description: "Search the knowledge base for specific information",
  similes: [
    "search knowledge",
    "find information",
    "look up",
    "query knowledge base",
    "search documents",
    "find in knowledge"
  ],
  examples: [
    [
      {
        name: "user",
        content: {
          text: "Search your knowledge for information about quantum computing"
        }
      },
      {
        name: "assistant",
        content: {
          text: "I'll search my knowledge base for information about quantum computing.",
          actions: ["SEARCH_KNOWLEDGE"]
        }
      }
    ]
  ],
  validate: async (runtime, message, state) => {
    const text = message.content.text?.toLowerCase() || "";
    const searchKeywords = ["search", "find", "look up", "query", "what do you know about"];
    const knowledgeKeywords = ["knowledge", "information", "document", "database"];
    const hasSearchKeyword = searchKeywords.some((keyword) => text.includes(keyword));
    const hasKnowledgeKeyword = knowledgeKeywords.some((keyword) => text.includes(keyword));
    const service = runtime.getService(KnowledgeService.serviceType);
    if (!service) {
      return false;
    }
    return hasSearchKeyword && hasKnowledgeKeyword;
  },
  handler: async (runtime, message, state, options, callback) => {
    try {
      const service = runtime.getService(KnowledgeService.serviceType);
      if (!service) {
        throw new Error("Knowledge service not available");
      }
      const text = message.content.text || "";
      const query = text.replace(/^(search|find|look up|query)\s+(your\s+)?knowledge\s+(base\s+)?(for\s+)?/i, "").trim();
      if (!query) {
        const response2 = {
          text: "What would you like me to search for in my knowledge base?"
        };
        if (callback) {
          await callback(response2);
        }
        return;
      }
      const searchMessage = {
        ...message,
        content: {
          text: query
        }
      };
      const results = await service.getKnowledge(searchMessage);
      let response;
      if (results.length === 0) {
        response = {
          text: `I couldn't find any information about "${query}" in my knowledge base.`
        };
      } else {
        const formattedResults = results.slice(0, 3).map((item, index) => `${index + 1}. ${item.content.text}`).join("\n\n");
        response = {
          text: `Here's what I found about "${query}":

${formattedResults}`
        };
      }
      if (callback) {
        await callback(response);
      }
    } catch (error) {
      logger9.error({ error }, "Error in SEARCH_KNOWLEDGE action");
      const errorResponse = {
        text: `I encountered an error while searching the knowledge base: ${error instanceof Error ? error.message : "Unknown error"}`
      };
      if (callback) {
        await callback(errorResponse);
      }
    }
  }
};
var knowledgeActions = [processKnowledgeAction, searchKnowledgeAction];

// src/routes.ts
import { MemoryType as MemoryType5, createUniqueUuid as createUniqueUuid2, logger as logger10, ModelType as ModelType4 } from "@elizaos/core";
import fs4 from "fs";
import path4 from "path";
import multer from "multer";
var createUploadMiddleware = (runtime) => {
  const uploadDir = runtime.getSetting("KNOWLEDGE_UPLOAD_DIR") || "/tmp/uploads/";
  const maxFileSize = parseInt(runtime.getSetting("KNOWLEDGE_MAX_FILE_SIZE") || "52428800");
  const maxFiles = parseInt(runtime.getSetting("KNOWLEDGE_MAX_FILES") || "10");
  const allowedMimeTypes = runtime.getSetting("KNOWLEDGE_ALLOWED_MIME_TYPES")?.split(",") || [
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/html",
    "application/json",
    "application/xml",
    "text/csv"
  ];
  return multer({
    dest: uploadDir,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles
    },
    fileFilter: (req, file, cb) => {
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `File type ${file.mimetype} not allowed. Allowed types: ${allowedMimeTypes.join(", ")}`
          )
        );
      }
    }
  });
};
function sendSuccess(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data }));
}
function sendError(res, status, code, message, details) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: { code, message, details } }));
}
var cleanupFile = (filePath) => {
  if (filePath && fs4.existsSync(filePath)) {
    try {
      fs4.unlinkSync(filePath);
    } catch (error) {
      logger10.error({ error }, `Error cleaning up file ${filePath}`);
    }
  }
};
var cleanupFiles = (files) => {
  if (files) {
    files.forEach((file) => cleanupFile(file.path));
  }
};
async function uploadKnowledgeHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, "SERVICE_NOT_FOUND", "KnowledgeService not found");
  }
  const hasUploadedFiles = req.files && req.files.length > 0;
  const isJsonRequest = !hasUploadedFiles && req.body && (req.body.fileUrl || req.body.fileUrls);
  if (!hasUploadedFiles && !isJsonRequest) {
    return sendError(res, 400, "INVALID_REQUEST", "Request must contain either files or URLs");
  }
  try {
    if (hasUploadedFiles) {
      const files = req.files;
      if (!files || files.length === 0) {
        return sendError(res, 400, "NO_FILES", "No files uploaded");
      }
      const invalidFiles = files.filter((file) => {
        if (file.size === 0) {
          logger10.warn(`File ${file.originalname} is empty`);
          return true;
        }
        if (!file.originalname || file.originalname.trim() === "") {
          logger10.warn(`File has no name`);
          return true;
        }
        if (!file.path) {
          logger10.warn(`File ${file.originalname} has no path`);
          return true;
        }
        return false;
      });
      if (invalidFiles.length > 0) {
        cleanupFiles(files);
        const invalidFileNames = invalidFiles.map((f) => f.originalname || "unnamed").join(", ");
        return sendError(
          res,
          400,
          "INVALID_FILES",
          `Invalid or corrupted files: ${invalidFileNames}`
        );
      }
      const agentId = req.body.agentId || req.query.agentId;
      if (!agentId) {
        logger10.error("[Document Processor] \u274C No agent ID provided in upload request");
        return sendError(
          res,
          400,
          "MISSING_AGENT_ID",
          "Agent ID is required for uploading knowledge"
        );
      }
      const worldId = req.body.worldId || agentId;
      logger10.info(`[Document Processor] \u{1F4E4} Processing file upload for agent: ${agentId}`);
      const processingPromises = files.map(async (file, index) => {
        const originalFilename = file.originalname;
        const filePath = file.path;
        logger10.debug(
          `[Document Processor] \u{1F4C4} Processing file: ${originalFilename} (agent: ${agentId})`
        );
        try {
          const fileBuffer = await fs4.promises.readFile(filePath);
          const base64Content = fileBuffer.toString("base64");
          const addKnowledgeOpts = {
            agentId,
            // Pass the agent ID from frontend
            clientDocumentId: "",
            // This will be ignored by the service
            contentType: file.mimetype,
            // Directly from multer file object
            originalFilename,
            // Directly from multer file object
            content: base64Content,
            // The base64 string of the file
            worldId,
            roomId: agentId,
            // Use the correct agent ID
            entityId: agentId
            // Use the correct agent ID
          };
          const result = await service.addKnowledge(addKnowledgeOpts);
          cleanupFile(filePath);
          return {
            id: result.clientDocumentId,
            // Use the content-based ID returned by the service
            filename: originalFilename,
            type: file.mimetype,
            size: file.size,
            uploadedAt: Date.now(),
            status: "success"
          };
        } catch (fileError) {
          logger10.error(
            `[Document Processor] \u274C Error processing file ${file.originalname}:`,
            fileError
          );
          cleanupFile(filePath);
          return {
            id: "",
            // No ID since processing failed
            filename: originalFilename,
            status: "error_processing",
            error: fileError.message
          };
        }
      });
      const results = await Promise.all(processingPromises);
      sendSuccess(res, results);
    } else if (isJsonRequest) {
      const fileUrls = Array.isArray(req.body.fileUrls) ? req.body.fileUrls : req.body.fileUrl ? [req.body.fileUrl] : [];
      if (fileUrls.length === 0) {
        return sendError(res, 400, "MISSING_URL", "File URL is required");
      }
      const agentId = req.body.agentId || req.query.agentId;
      if (!agentId) {
        logger10.error("[Document Processor] \u274C No agent ID provided in URL request");
        return sendError(
          res,
          400,
          "MISSING_AGENT_ID",
          "Agent ID is required for uploading knowledge from URLs"
        );
      }
      logger10.info(`[Document Processor] \u{1F4E4} Processing URL upload for agent: ${agentId}`);
      const processingPromises = fileUrls.map(async (fileUrl) => {
        try {
          const normalizedUrl = normalizeS3Url(fileUrl);
          const urlObject = new URL(fileUrl);
          const pathSegments = urlObject.pathname.split("/");
          const encodedFilename = pathSegments[pathSegments.length - 1] || "document.pdf";
          const originalFilename = decodeURIComponent(encodedFilename);
          logger10.debug(`[Document Processor] \u{1F310} Fetching content from URL: ${fileUrl}`);
          const { content, contentType: fetchedContentType } = await fetchUrlContent(fileUrl);
          let contentType = fetchedContentType;
          if (contentType === "application/octet-stream") {
            const fileExtension = originalFilename.split(".").pop()?.toLowerCase();
            if (fileExtension) {
              if (["pdf"].includes(fileExtension)) {
                contentType = "application/pdf";
              } else if (["txt", "text"].includes(fileExtension)) {
                contentType = "text/plain";
              } else if (["md", "markdown"].includes(fileExtension)) {
                contentType = "text/markdown";
              } else if (["doc", "docx"].includes(fileExtension)) {
                contentType = "application/msword";
              } else if (["html", "htm"].includes(fileExtension)) {
                contentType = "text/html";
              } else if (["json"].includes(fileExtension)) {
                contentType = "application/json";
              } else if (["xml"].includes(fileExtension)) {
                contentType = "application/xml";
              }
            }
          }
          const addKnowledgeOpts = {
            agentId,
            // Pass the agent ID from frontend
            clientDocumentId: "",
            // This will be ignored by the service
            contentType,
            originalFilename,
            content,
            // Use the base64 encoded content from the URL
            worldId: agentId,
            roomId: agentId,
            entityId: agentId,
            // Store the normalized URL in metadata
            metadata: {
              url: normalizedUrl
            }
          };
          logger10.debug(
            `[Document Processor] \u{1F4C4} Processing knowledge from URL: ${originalFilename} (type: ${contentType})`
          );
          const result = await service.addKnowledge(addKnowledgeOpts);
          return {
            id: result.clientDocumentId,
            // Use the content-based ID returned by the service
            fileUrl,
            filename: originalFilename,
            message: "Knowledge created successfully",
            createdAt: Date.now(),
            fragmentCount: result.fragmentCount,
            status: "success"
          };
        } catch (urlError) {
          logger10.error(`[Document Processor] \u274C Error processing URL ${fileUrl}:`, urlError);
          return {
            fileUrl,
            status: "error_processing",
            error: urlError.message
          };
        }
      });
      const results = await Promise.all(processingPromises);
      sendSuccess(res, results);
    }
  } catch (error) {
    logger10.error({ error }, "[Document Processor] \u274C Error processing knowledge");
    if (hasUploadedFiles) {
      cleanupFiles(req.files);
    }
    sendError(res, 500, "PROCESSING_ERROR", "Failed to process knowledge", error.message);
  }
}
async function getKnowledgeDocumentsHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(
      res,
      500,
      "SERVICE_NOT_FOUND",
      "KnowledgeService not found for getKnowledgeDocumentsHandler"
    );
  }
  try {
    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 1e4;
    const before = req.query.before ? Number.parseInt(req.query.before, 10) : Date.now();
    const includeEmbedding = req.query.includeEmbedding === "true";
    const agentId = req.query.agentId;
    const fileUrls = req.query.fileUrls ? typeof req.query.fileUrls === "string" && req.query.fileUrls.includes(",") ? req.query.fileUrls.split(",") : [req.query.fileUrls] : null;
    const memories = await service.getMemories({
      tableName: "documents",
      count: limit,
      end: before
    });
    let filteredMemories = memories;
    if (fileUrls && fileUrls.length > 0) {
      const normalizedRequestUrls = fileUrls.map((url) => normalizeS3Url(url));
      const urlBasedIds = normalizedRequestUrls.map(
        (url) => createUniqueUuid2(runtime, url)
      );
      filteredMemories = memories.filter(
        (memory) => urlBasedIds.includes(memory.id) || // If the ID corresponds directly
        // Or if the URL is stored in the metadata (check if it exists)
        memory.metadata && "url" in memory.metadata && typeof memory.metadata.url === "string" && normalizedRequestUrls.includes(normalizeS3Url(memory.metadata.url))
      );
      logger10.debug(
        `[Document Processor] \u{1F50D} Filtered documents by URLs: ${fileUrls.length} URLs, found ${filteredMemories.length} matching documents`
      );
    }
    const cleanMemories = includeEmbedding ? filteredMemories : filteredMemories.map((memory) => ({
      ...memory,
      embedding: void 0
    }));
    sendSuccess(res, {
      memories: cleanMemories,
      urlFiltered: fileUrls ? true : false,
      totalFound: cleanMemories.length,
      totalRequested: fileUrls ? fileUrls.length : 0
    });
  } catch (error) {
    logger10.error({ error }, "[Document Processor] \u274C Error retrieving documents");
    sendError(res, 500, "RETRIEVAL_ERROR", "Failed to retrieve documents", error.message);
  }
}
async function deleteKnowledgeDocumentHandler(req, res, runtime) {
  logger10.debug(`[Document Processor] \u{1F5D1}\uFE0F DELETE request for document: ${req.params.knowledgeId}`);
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(
      res,
      500,
      "SERVICE_NOT_FOUND",
      "KnowledgeService not found for deleteKnowledgeDocumentHandler"
    );
  }
  const knowledgeId = req.params.knowledgeId;
  if (!knowledgeId || knowledgeId.length < 36) {
    logger10.error(`[Document Processor] \u274C Invalid knowledge ID format: ${knowledgeId}`);
    return sendError(res, 400, "INVALID_ID", "Invalid Knowledge ID format");
  }
  try {
    const typedKnowledgeId = knowledgeId;
    logger10.debug(`[Document Processor] \u{1F5D1}\uFE0F Deleting document: ${typedKnowledgeId}`);
    await service.deleteMemory(typedKnowledgeId);
    logger10.info(`[Document Processor] \u2705 Successfully deleted document: ${typedKnowledgeId}`);
    sendSuccess(res, null, 204);
  } catch (error) {
    logger10.error({ error }, `[Document Processor] \u274C Error deleting document ${knowledgeId}`);
    sendError(res, 500, "DELETE_ERROR", "Failed to delete document", error.message);
  }
}
async function getKnowledgeByIdHandler(req, res, runtime) {
  logger10.debug(`[Document Processor] \u{1F50D} GET request for document: ${req.params.knowledgeId}`);
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(
      res,
      500,
      "SERVICE_NOT_FOUND",
      "KnowledgeService not found for getKnowledgeByIdHandler"
    );
  }
  const knowledgeId = req.params.knowledgeId;
  if (!knowledgeId || knowledgeId.length < 36) {
    logger10.error(`[Document Processor] \u274C Invalid knowledge ID format: ${knowledgeId}`);
    return sendError(res, 400, "INVALID_ID", "Invalid Knowledge ID format");
  }
  try {
    logger10.debug(`[Document Processor] \u{1F50D} Retrieving document: ${knowledgeId}`);
    const agentId = req.query.agentId;
    const memories = await service.getMemories({
      tableName: "documents",
      count: 1e4
    });
    const typedKnowledgeId = knowledgeId;
    const document = memories.find((memory) => memory.id === typedKnowledgeId);
    if (!document) {
      return sendError(res, 404, "NOT_FOUND", `Knowledge with ID ${typedKnowledgeId} not found`);
    }
    const cleanDocument = {
      ...document,
      embedding: void 0
    };
    sendSuccess(res, { document: cleanDocument });
  } catch (error) {
    logger10.error({ error }, `[Document Processor] \u274C Error retrieving document ${knowledgeId}`);
    sendError(res, 500, "RETRIEVAL_ERROR", "Failed to retrieve document", error.message);
  }
}
async function knowledgePanelHandler(req, res, runtime) {
  const agentId = runtime.agentId;
  logger10.debug(`[Document Processor] \u{1F310} Serving knowledge panel for agent ${agentId}`);
  const requestPath = req.originalUrl || req.url || req.path;
  const pluginBasePath = requestPath.replace(/\/display.*$/, "");
  logger10.debug(`[Document Processor] \u{1F310} Plugin base path: ${pluginBasePath}`);
  try {
    const currentDir = path4.dirname(new URL(import.meta.url).pathname);
    const frontendPath = path4.join(currentDir, "../dist/index.html");
    logger10.debug(`[Document Processor] \u{1F310} Looking for frontend at: ${frontendPath}`);
    if (fs4.existsSync(frontendPath)) {
      const html = await fs4.promises.readFile(frontendPath, "utf8");
      let injectedHtml = html.replace(
        "<head>",
        `<head>
          <script>
            window.ELIZA_CONFIG = {
              agentId: '${agentId}',
              apiBase: '${pluginBasePath}'
            };
          </script>`
      );
      injectedHtml = injectedHtml.replace(/src="\.\/assets\//g, `src="${pluginBasePath}/assets/`);
      injectedHtml = injectedHtml.replace(/href="\.\/assets\//g, `href="${pluginBasePath}/assets/`);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(injectedHtml);
    } else {
      let cssFile = "index.css";
      let jsFile = "index.js";
      const manifestPath = path4.join(currentDir, "../dist/manifest.json");
      if (fs4.existsSync(manifestPath)) {
        try {
          const manifestContent = await fs4.promises.readFile(manifestPath, "utf8");
          const manifest = JSON.parse(manifestContent);
          for (const [key, value] of Object.entries(manifest)) {
            if (typeof value === "object" && value !== null) {
              if (key.endsWith(".css") || value.file?.endsWith(".css")) {
                cssFile = value.file || key;
              }
              if (key.endsWith(".js") || value.file?.endsWith(".js")) {
                jsFile = value.file || key;
              }
            }
          }
        } catch (manifestError) {
          logger10.error({ error: manifestError }, "[Document Processor] \u274C Error reading manifest");
        }
      }
      logger10.debug(`[Document Processor] \u{1F310} Using fallback with CSS: ${cssFile}, JS: ${jsFile}`);
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge</title>
    <script>
      window.ELIZA_CONFIG = {
        agentId: '${agentId}',
        apiBase: '${pluginBasePath}'
      };
    </script>
    <link rel="stylesheet" href="${pluginBasePath}/assets/${cssFile}">
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .loading { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div id="root">
            <div class="loading">Loading Knowledge Library...</div>
        </div>
    </div>
    <script type="module" src="${pluginBasePath}/assets/${jsFile}"></script>
</body>
</html>`;
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
  } catch (error) {
    logger10.error({ error }, "[Document Processor] \u274C Error serving frontend");
    sendError(res, 500, "FRONTEND_ERROR", "Failed to load knowledge panel", error.message);
  }
}
async function frontendAssetHandler(req, res, runtime) {
  try {
    const fullPath = req.originalUrl || req.url || req.path;
    logger10.debug(`[Document Processor] \u{1F310} Asset request: ${fullPath}`);
    const currentDir = path4.dirname(new URL(import.meta.url).pathname);
    const assetsMarker = "/assets/";
    const assetsStartIndex = fullPath.lastIndexOf(assetsMarker);
    let assetName = null;
    if (assetsStartIndex !== -1) {
      assetName = fullPath.substring(assetsStartIndex + assetsMarker.length);
      const queryIndex = assetName.indexOf("?");
      if (queryIndex !== -1) {
        assetName = assetName.substring(0, queryIndex);
      }
    }
    if (!assetName || assetName.includes("..")) {
      return sendError(
        res,
        400,
        "BAD_REQUEST",
        `Invalid asset name: '${assetName}' from path ${fullPath}`
      );
    }
    const assetPath = path4.join(currentDir, "../dist/assets", assetName);
    logger10.debug(`[Document Processor] \u{1F310} Serving asset: ${assetPath}`);
    if (fs4.existsSync(assetPath)) {
      const fileStream = fs4.createReadStream(assetPath);
      let contentType = "application/octet-stream";
      if (assetPath.endsWith(".js")) {
        contentType = "application/javascript";
      } else if (assetPath.endsWith(".css")) {
        contentType = "text/css";
      }
      res.writeHead(200, { "Content-Type": contentType });
      fileStream.pipe(res);
    } else {
      sendError(res, 404, "NOT_FOUND", `Asset not found: ${req.url}`);
    }
  } catch (error) {
    logger10.error({ error }, `[Document Processor] \u274C Error serving asset ${req.url}`);
    sendError(res, 500, "ASSET_ERROR", `Failed to load asset ${req.url}`, error.message);
  }
}
async function getKnowledgeChunksHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, "SERVICE_NOT_FOUND", "KnowledgeService not found");
  }
  try {
    const documentId = req.query.documentId;
    const documentsOnly = req.query.documentsOnly === "true";
    const documents = await service.getMemories({
      tableName: "documents",
      count: 1e4,
      // High limit to get all documents
      end: Date.now()
    });
    if (documentsOnly) {
      sendSuccess(res, {
        chunks: documents,
        stats: {
          documents: documents.length,
          fragments: 0,
          mode: "documents-only"
        }
      });
      return;
    }
    if (documentId) {
      const allFragments = await service.getMemories({
        tableName: "knowledge",
        count: 5e4
        // Reduced from 100000 - still high enough for large documents
      });
      const documentFragments = allFragments.filter((fragment) => {
        const metadata = fragment.metadata;
        return metadata?.documentId === documentId;
      });
      const specificDocument = documents.find((d) => d.id === documentId);
      const results = specificDocument ? [specificDocument, ...documentFragments] : documentFragments;
      sendSuccess(res, {
        chunks: results,
        stats: {
          documents: specificDocument ? 1 : 0,
          fragments: documentFragments.length,
          mode: "single-document",
          documentId
        }
      });
      return;
    }
    sendSuccess(res, {
      chunks: documents,
      stats: {
        documents: documents.length,
        fragments: 0,
        mode: "documents-only"
      }
    });
  } catch (error) {
    logger10.error({ error }, "[Document Processor] \u274C Error retrieving chunks");
    sendError(res, 500, "RETRIEVAL_ERROR", "Failed to retrieve knowledge chunks", error.message);
  }
}
async function searchKnowledgeHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, "SERVICE_NOT_FOUND", "KnowledgeService not found");
  }
  try {
    const searchText = req.query.q;
    const parsedThreshold = req.query.threshold ? Number.parseFloat(req.query.threshold) : NaN;
    let matchThreshold = Number.isNaN(parsedThreshold) ? 0.5 : parsedThreshold;
    matchThreshold = Math.max(0, Math.min(1, matchThreshold));
    const parsedLimit = req.query.limit ? Number.parseInt(req.query.limit, 10) : NaN;
    let limit = Number.isNaN(parsedLimit) ? 20 : parsedLimit;
    limit = Math.max(1, Math.min(100, limit));
    const agentId = req.query.agentId || runtime.agentId;
    if (!searchText || searchText.trim().length === 0) {
      return sendError(res, 400, "INVALID_QUERY", "Search query cannot be empty");
    }
    if (req.query.threshold && (parsedThreshold < 0 || parsedThreshold > 1)) {
      logger10.debug(
        `[Document Processor] \u{1F50D} Threshold value ${parsedThreshold} was clamped to ${matchThreshold}`
      );
    }
    if (req.query.limit && (parsedLimit < 1 || parsedLimit > 100)) {
      logger10.debug(`[Document Processor] \u{1F50D} Limit value ${parsedLimit} was clamped to ${limit}`);
    }
    logger10.debug(
      `[Document Processor] \u{1F50D} Searching: "${searchText}" (threshold: ${matchThreshold}, limit: ${limit})`
    );
    const embedding = await runtime.useModel(ModelType4.TEXT_EMBEDDING, {
      text: searchText
    });
    const results = await runtime.searchMemories({
      tableName: "knowledge",
      embedding,
      query: searchText,
      count: limit,
      match_threshold: matchThreshold,
      roomId: agentId
    });
    const enhancedResults = await Promise.all(
      results.map(async (fragment) => {
        let documentTitle = "Unknown Document";
        let documentFilename = "unknown";
        if (fragment.metadata && typeof fragment.metadata === "object" && "documentId" in fragment.metadata) {
          const documentId = fragment.metadata.documentId;
          try {
            const document = await runtime.getMemoryById(documentId);
            if (document && document.metadata) {
              documentTitle = document.metadata.title || document.metadata.filename || documentTitle;
              documentFilename = document.metadata.filename || documentFilename;
            }
          } catch (e) {
            logger10.debug(`Could not fetch document ${documentId} for fragment`);
          }
        }
        return {
          id: fragment.id,
          content: fragment.content,
          similarity: fragment.similarity || 0,
          metadata: {
            ...fragment.metadata || {},
            documentTitle,
            documentFilename
          }
        };
      })
    );
    logger10.info(
      `[Document Processor] \u{1F50D} Found ${enhancedResults.length} results for: "${searchText}"`
    );
    sendSuccess(res, {
      query: searchText,
      threshold: matchThreshold,
      results: enhancedResults,
      count: enhancedResults.length
    });
  } catch (error) {
    logger10.error({ error }, "[Document Processor] \u274C Error searching knowledge");
    sendError(res, 500, "SEARCH_ERROR", "Failed to search knowledge", error.message);
  }
}
async function getGraphNodesHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, "SERVICE_NOT_FOUND", "KnowledgeService not found");
  }
  try {
    const parsedPage = req.query.page ? Number.parseInt(req.query.page, 10) : 1;
    const parsedLimit = req.query.limit ? Number.parseInt(req.query.limit, 10) : 20;
    const type = req.query.type;
    const agentId = req.query.agentId || runtime.agentId;
    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const limit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 20 : Math.min(parsedLimit, 50);
    const offset = (page - 1) * limit;
    logger10.debug(
      `[Graph API] \u{1F4CA} Fetching graph nodes: page=${page}, limit=${limit}, type=${type || "all"}, agent=${agentId}`
    );
    const totalDocuments = await service.countMemories({
      tableName: "documents",
      roomId: agentId,
      unique: false
      // Count all documents, not just unique ones
    });
    const totalPages = Math.ceil(totalDocuments / limit);
    const hasMore = page < totalPages;
    const paginatedDocuments = await service.getMemories({
      tableName: "documents",
      roomId: agentId,
      count: limit,
      offset
    });
    const nodes = [];
    const links = [];
    paginatedDocuments.forEach((doc) => {
      if (!doc.id) {
        logger10.warn(`[Graph API] \u26A0\uFE0F  Skipping document without ID`);
        return;
      }
      nodes.push({ id: doc.id, type: "document" });
    });
    if (type !== "document") {
      const allFragments = await service.getMemories({
        tableName: "knowledge",
        roomId: agentId,
        count: 5e4
        // Reduced from 100000 - still high enough for large documents
      });
      logger10.debug(`[Graph API] \u{1F4CA} Total fragments found: ${allFragments.length}`);
      if (allFragments.length > 0) {
        logger10.debug(
          `[Graph API] \u{1F4CA} Sample fragment metadata: ${JSON.stringify(
            allFragments.slice(0, 3).map((f) => ({
              id: f.id,
              metadata: f.metadata
            }))
          )}`
        );
      }
      paginatedDocuments.forEach((doc) => {
        if (!doc.id) {
          return;
        }
        const docFragments = allFragments.filter((fragment) => {
          const metadata = fragment.metadata;
          const typeString = typeof metadata?.type === "string" ? metadata.type : null;
          const isFragment = typeString && typeString.toLowerCase() === "fragment" || metadata?.type === MemoryType5.FRAGMENT || // If no type but has documentId, assume it's a fragment
          !metadata?.type && metadata?.documentId;
          return metadata?.documentId === doc.id && isFragment;
        });
        if (docFragments.length > 0) {
          logger10.debug(`[Graph API] \u{1F4CA} Document ${doc.id} has ${docFragments.length} fragments`);
        }
        docFragments.forEach((frag) => {
          const docId = doc.id;
          if (!frag.id || !docId) {
            logger10.warn(
              `[Graph API] \u26A0\uFE0F  Skipping fragment without ID for document ${docId || "unknown"}`
            );
            return;
          }
          nodes.push({ id: frag.id, type: "fragment" });
          links.push({ source: docId, target: frag.id });
        });
      });
      logger10.info(
        `[Graph API] \u{1F4CA} Final graph: ${nodes.length} nodes (${paginatedDocuments.length} documents), ${links.length} links`
      );
    }
    sendSuccess(res, {
      nodes,
      links,
      pagination: {
        currentPage: page,
        totalPages,
        hasMore,
        totalDocuments
      }
    });
  } catch (error) {
    logger10.error("[Graph API] \u274C Error fetching graph nodes:", error);
    sendError(res, 500, "GRAPH_ERROR", "Failed to fetch graph nodes", error.message);
  }
}
async function getGraphNodeDetailsHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, "SERVICE_NOT_FOUND", "KnowledgeService not found");
  }
  const nodeId = req.params.nodeId;
  const agentId = req.query.agentId || runtime.agentId;
  if (!nodeId || nodeId.length < 36) {
    return sendError(res, 400, "INVALID_ID", "Invalid node ID format");
  }
  try {
    logger10.info(`[Graph API] \u{1F4CA} Fetching node details for: ${nodeId}, agent: ${agentId}`);
    const allDocuments = await service.getMemories({
      tableName: "documents",
      count: 1e4
    });
    logger10.debug(`[Graph API] \u{1F4CA} Total documents in DB: ${allDocuments.length}`);
    let document = allDocuments.find((doc) => doc.id === nodeId && doc.roomId === agentId);
    if (!document) {
      logger10.debug(`[Graph API] \u{1F4CA} Document not found with roomId filter, trying without filter`);
      document = allDocuments.find((doc) => doc.id === nodeId);
      if (document) {
        logger10.warn(
          `[Graph API] \u26A0\uFE0F Document ${nodeId} found but has different roomId: ${document.roomId} vs ${agentId}`
        );
      }
    }
    if (document) {
      logger10.info(`[Graph API] \u2705 Found document: ${nodeId}`);
      sendSuccess(res, {
        id: document.id,
        type: "document",
        content: document.content,
        metadata: document.metadata,
        createdAt: document.createdAt,
        entityId: document.entityId,
        roomId: document.roomId,
        agentId: document.agentId,
        worldId: document.worldId
      });
      return;
    }
    logger10.debug(`[Graph API] \u{1F4CA} Document not found, searching in fragments`);
    const allFragments = await service.getMemories({
      tableName: "knowledge",
      count: 5e4
      // Reduced from 100000 - still high enough for large documents
    });
    logger10.debug(`[Graph API] \u{1F4CA} Total fragments in DB: ${allFragments.length}`);
    let fragment = allFragments.find((frag) => frag.id === nodeId && frag.roomId === agentId);
    if (!fragment) {
      logger10.debug(`[Graph API] \u{1F4CA} Fragment not found with roomId filter, trying without filter`);
      fragment = allFragments.find((frag) => frag.id === nodeId);
      if (fragment) {
        logger10.warn(
          `[Graph API] \u26A0\uFE0F Fragment ${nodeId} found but has different roomId: ${fragment.roomId} vs ${agentId}`
        );
      }
    }
    if (fragment) {
      logger10.info(`[Graph API] \u2705 Found fragment: ${nodeId}`);
      sendSuccess(res, {
        id: fragment.id,
        type: "fragment",
        content: fragment.content,
        metadata: fragment.metadata,
        createdAt: fragment.createdAt,
        entityId: fragment.entityId,
        roomId: fragment.roomId,
        agentId: fragment.agentId,
        worldId: fragment.worldId
      });
      return;
    }
    logger10.error(`[Graph API] \u274C Node ${nodeId} not found in documents or fragments`);
    sendError(res, 404, "NOT_FOUND", `Node with ID ${nodeId} not found`);
  } catch (error) {
    logger10.error(`[Graph API] \u274C Error fetching node details for ${nodeId}:`, error);
    sendError(res, 500, "GRAPH_ERROR", "Failed to fetch node details", error.message);
  }
}
async function expandDocumentGraphHandler(req, res, runtime) {
  const service = runtime.getService(KnowledgeService.serviceType);
  if (!service) {
    return sendError(res, 500, "SERVICE_NOT_FOUND", "KnowledgeService not found");
  }
  const documentId = req.params.documentId;
  const agentId = req.query.agentId || runtime.agentId;
  if (!documentId || documentId.length < 36) {
    return sendError(res, 400, "INVALID_ID", "Invalid document ID format");
  }
  try {
    logger10.debug(`[Graph API] \u{1F4CA} Expanding document: ${documentId}, agent: ${agentId}`);
    const allFragments = await service.getMemories({
      tableName: "knowledge",
      roomId: agentId,
      // Filter by agent
      count: 5e4
      // Reduced from 100000 - still high enough for large documents
    });
    logger10.debug(`[Graph API] \u{1F4CA} Total fragments in knowledge table: ${allFragments.length}`);
    if (allFragments.length > 0 && process.env.NODE_ENV !== "production") {
      logger10.debug(
        `[Graph API] \u{1F4CA} Sample fragment metadata: ${JSON.stringify(allFragments[0].metadata)}`
      );
      const uniqueTypes = new Set(allFragments.map((f) => f.metadata?.type));
      logger10.debug(
        `[Graph API] \u{1F4CA} Unique metadata types found in knowledge table: ${JSON.stringify(Array.from(uniqueTypes))}`
      );
      const relevantFragments = allFragments.filter((fragment) => {
        const metadata = fragment.metadata;
        const hasDocumentId = metadata?.documentId === documentId;
        if (hasDocumentId) {
          logger10.debug(
            `[Graph API] \u{1F4CA} Fragment ${fragment.id} metadata: ${JSON.stringify(metadata)}`
          );
        }
        return hasDocumentId;
      });
      logger10.debug(
        `[Graph API] \u{1F4CA} Fragments with matching documentId: ${relevantFragments.length}`
      );
    }
    const documentFragments = allFragments.filter((fragment) => {
      const metadata = fragment.metadata;
      const typeString = typeof metadata?.type === "string" ? metadata.type : null;
      const isFragment = typeString && typeString.toLowerCase() === "fragment" || metadata?.type === MemoryType5.FRAGMENT || // If no type but has documentId, assume it's a fragment
      !metadata?.type && metadata?.documentId;
      return metadata?.documentId === documentId && isFragment;
    });
    const nodes = documentFragments.filter((frag) => frag.id !== void 0).map((frag) => ({
      id: frag.id,
      type: "fragment"
    }));
    const links = documentFragments.filter((frag) => frag.id !== void 0).map((frag) => ({
      source: documentId,
      target: frag.id
    }));
    logger10.info(`[Graph API] \u{1F4CA} Found ${nodes.length} fragments for document ${documentId}`);
    sendSuccess(res, {
      documentId,
      nodes,
      links,
      fragmentCount: nodes.length
    });
  } catch (error) {
    logger10.error(`[Graph API] \u274C Error expanding document ${documentId}:`, error);
    sendError(res, 500, "GRAPH_ERROR", "Failed to expand document", error.message);
  }
}
async function uploadKnowledgeWithMulter(req, res, runtime) {
  const upload = createUploadMiddleware(runtime);
  const uploadArray = upload.array(
    "files",
    parseInt(runtime.getSetting("KNOWLEDGE_MAX_FILES") || "10")
  );
  uploadArray(req, res, (err) => {
    if (err) {
      logger10.error({ error: err }, "[Document Processor] \u274C File upload error");
      return sendError(res, 400, "UPLOAD_ERROR", err.message);
    }
    uploadKnowledgeHandler(req, res, runtime);
  });
}
var knowledgeRoutes = [
  {
    type: "GET",
    name: "Knowledge",
    path: "/display",
    handler: knowledgePanelHandler,
    public: true
  },
  {
    type: "GET",
    path: "/assets/*",
    handler: frontendAssetHandler
  },
  {
    type: "POST",
    path: "/documents",
    handler: uploadKnowledgeWithMulter
  },
  {
    type: "GET",
    path: "/documents",
    handler: getKnowledgeDocumentsHandler
  },
  {
    type: "GET",
    path: "/documents/:knowledgeId",
    handler: getKnowledgeByIdHandler
  },
  {
    type: "DELETE",
    path: "/documents/:knowledgeId",
    handler: deleteKnowledgeDocumentHandler
  },
  {
    type: "GET",
    path: "/knowledges",
    handler: getKnowledgeChunksHandler
  },
  {
    type: "GET",
    path: "/search",
    handler: searchKnowledgeHandler
  },
  // New graph routes
  {
    type: "GET",
    path: "/graph/nodes",
    handler: getGraphNodesHandler
  },
  {
    type: "GET",
    path: "/graph/node/:nodeId",
    handler: getGraphNodeDetailsHandler
  },
  {
    type: "GET",
    path: "/graph/expand/:documentId",
    handler: expandDocumentGraphHandler
  }
];

// src/index.ts
function createKnowledgePlugin(config = {}) {
  const { enableUI = true, enableRoutes = true, enableActions = true, enableTests = true } = config;
  const plugin = {
    name: "knowledge",
    description: "Plugin for Retrieval Augmented Generation, including knowledge management and embedding.",
    services: [KnowledgeService],
    providers: [knowledgeProvider, documentsProvider]
  };
  if (enableUI || enableRoutes) {
    plugin.routes = knowledgeRoutes;
    logger11.debug("[Knowledge Plugin] Routes enabled");
  } else {
    logger11.info("[Knowledge Plugin] Running in headless mode (no routes or UI)");
  }
  if (enableActions) {
    plugin.actions = knowledgeActions;
  }
  if (enableTests) {
    plugin.tests = [tests_default];
  }
  return plugin;
}
var knowledgePluginCore = createKnowledgePlugin({
  enableUI: false,
  enableRoutes: false,
  enableActions: false,
  enableTests: false
});
var knowledgePluginHeadless = createKnowledgePlugin({
  enableUI: false,
  enableRoutes: false,
  enableActions: true,
  enableTests: false
});
var knowledgePlugin = createKnowledgePlugin({
  enableUI: true,
  enableRoutes: true,
  enableActions: true,
  enableTests: true
});
var index_default = knowledgePlugin;
export {
  KnowledgeService,
  KnowledgeServiceType,
  ModelConfigSchema,
  createKnowledgePlugin,
  index_default as default,
  documentsProvider,
  knowledgePlugin,
  knowledgePluginCore,
  knowledgePluginHeadless,
  knowledgeProvider
};
//# sourceMappingURL=index.js.map