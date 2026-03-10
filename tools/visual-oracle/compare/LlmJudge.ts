import Anthropic from '@anthropic-ai/sdk';

export interface JudgeConfig {
  aspects: string[];
  minimumScore: number;
}

export interface JudgeResult {
  overallScore: number;
  aspectScores: Record<string, number>;
  similarities: string[];
  differences: string[];
  suggestions: string[];
}

type ContentBlock = { type: 'text'; text: string } | {
  type: 'image';
  source: { type: 'base64'; media_type: 'image/png'; data: string };
};

/**
 * Uses Claude vision to compare original C&C Generals screenshots
 * against browser port screenshots.
 */
export class LlmJudge {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : undefined);
  }

  async compare(
    originalScreenshots: Buffer[],
    remakeScreenshots: Buffer[],
    scenarioName: string,
    scenarioDescription: string,
    config: JudgeConfig,
  ): Promise<JudgeResult> {
    console.log(`[Judge] Comparing ${originalScreenshots.length} original vs ${remakeScreenshots.length} remake screenshots`);

    const originalBlocks = buildImageBlocks('ORIGINAL GAME (C&C Generals Zero Hour, 2003)', originalScreenshots);
    const remakeBlocks = buildImageBlocks('BROWSER PORT (WebGL/Three.js remake)', remakeScreenshots);
    const aspectList = config.aspects.map(a => `  - ${a}`).join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          ...originalBlocks,
          ...remakeBlocks,
          {
            type: 'text',
            text: `You are comparing screenshots from the ORIGINAL C&C Generals: Zero Hour (2003 PC game, DirectX 8) with a BROWSER PORT of the same game (WebGL/Three.js).

Scenario: ${scenarioName}
Description: ${scenarioDescription}

The browser port aims for a faithful recreation. Please evaluate the visual and gameplay parity.

Rate the following aspects on a scale of 1-10 (1=completely different, 10=nearly identical):
${aspectList}

Also rate the OVERALL parity from 1-10.

Reply with ONLY valid JSON:
{
  "overallScore": <number 1-10>,
  "aspectScores": { ${config.aspects.map(a => `"${a}": <number>`).join(', ')} },
  "similarities": ["<what matches well>", "..."],
  "differences": ["<notable divergence>", "..."],
  "suggestions": ["<improvement idea>", "..."]
}

Be fair — this is a browser port of a 2003 DirectX game. Pixel-perfect matching is not expected.
Focus on whether the port captures the correct layout, scale, colors, and behavior.`,
          },
        ],
      }],
    });

    return this.parseAndValidate(response);
  }

  /**
   * Judge remake screenshots without originals available.
   * Rates based on Claude's knowledge of the original game.
   */
  async judgeRemakeOnly(
    remakeScreenshots: Buffer[],
    scenarioName: string,
    scenarioDescription: string,
    config: JudgeConfig,
  ): Promise<JudgeResult> {
    console.log(`[Judge] Rating ${remakeScreenshots.length} remake screenshots (no original available)`);

    const remakeBlocks = buildImageBlocks('BROWSER PORT', remakeScreenshots);
    const aspectList = config.aspects.map(a => `  - ${a}`).join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          ...remakeBlocks,
          {
            type: 'text',
            text: `You are evaluating screenshots from a BROWSER PORT of C&C Generals: Zero Hour (2003 RTS by EA/DICE LA).

Scenario: ${scenarioName}
Description: ${scenarioDescription}

Based on your knowledge of the original game, rate how faithfully this port captures the visual style and gameplay.

Rate the following aspects on a scale of 1-10 (1=completely wrong, 10=very faithful):
${aspectList}

Also rate the OVERALL faithfulness from 1-10.

Reply with ONLY valid JSON:
{
  "overallScore": <number 1-10>,
  "aspectScores": { ${config.aspects.map(a => `"${a}": <number>`).join(', ')} },
  "similarities": ["<what matches the original well>", "..."],
  "differences": ["<notable divergence>", "..."],
  "suggestions": ["<improvement idea>", "..."]
}`,
          },
        ],
      }],
    });

    return this.parseAndValidate(response);
  }

  private parseAndValidate(response: Anthropic.Message): JudgeResult {
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log('[Judge] Raw response:', text);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM judge did not return valid JSON');
    }

    const result: JudgeResult = JSON.parse(jsonMatch[0]);

    if (typeof result.overallScore !== 'number' || result.overallScore < 1 || result.overallScore > 10) {
      throw new Error(`Invalid overallScore: ${result.overallScore}`);
    }

    console.log(`[Judge] Overall score: ${result.overallScore}/10`);
    for (const [aspect, score] of Object.entries(result.aspectScores)) {
      console.log(`[Judge]   ${aspect}: ${score}/10`);
    }

    return result;
  }
}

function buildImageBlocks(label: string, screenshots: Buffer[]): ContentBlock[] {
  return screenshots.flatMap((buf, i) => [
    {
      type: 'text' as const,
      text: `${label} — Screenshot ${i + 1}:`,
    },
    {
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: 'image/png' as const,
        data: buf.toString('base64'),
      },
    },
  ]);
}
