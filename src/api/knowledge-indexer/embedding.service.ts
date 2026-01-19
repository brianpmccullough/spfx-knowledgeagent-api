import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AzureOpenAI } from 'openai';
import { ConfigurationService } from '../config/configuration.service';

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private client: AzureOpenAI;
  private deploymentName: string;

  constructor(private readonly configurationService: ConfigurationService) {}

  async onModuleInit() {
    const { configuration, secrets } = this.configurationService;

    this.deploymentName = configuration.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;

    this.client = new AzureOpenAI({
      endpoint: configuration.AZURE_OPENAI_ENDPOINT,
      apiKey: secrets.AZURE_OPENAI_API_KEY,
      apiVersion: configuration.AZURE_OPENAI_API_VERSION,
    });

    this.logger.log(`Embedding service initialized with deployment: ${this.deploymentName}`);
  }

  /**
   * Generate embedding for a single text string.
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const results = await this.generateEmbeddings([text]);
    return results[0];
  }

  /**
   * Generate embeddings for multiple texts in a single batch.
   * Azure OpenAI supports up to 16 texts per batch for embeddings.
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    // Azure OpenAI has a limit of 16 items per batch
    const batchSize = 16;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      try {
        const response = await this.client.embeddings.create({
          model: this.deploymentName,
          input: batch,
        });

        for (const item of response.data) {
          results.push({
            embedding: item.embedding,
            tokenCount: response.usage?.total_tokens
              ? Math.round(response.usage.total_tokens / batch.length)
              : 0,
          });
        }
      } catch (error) {
        this.logger.error(`Failed to generate embeddings for batch starting at index ${i}`, error);
        throw error;
      }
    }

    this.logger.debug(`Generated ${results.length} embeddings`);
    return results;
  }
}
