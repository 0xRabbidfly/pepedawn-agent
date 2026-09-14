import { describe, it, expect } from 'bun:test';
import { recordingReplies, MAX_RECORDED_REPLY_CHARS } from '../../utils/commandReplies';

describe('recordingReplies', () => {
  it('remembers what a command showed, once it is sent', async () => {
    const order: string[] = [];
    const callback = recordingReplies(
      async (response: any) => {
        order.push(`sent: ${response.text}`);
        return [];
      },
      (text) => order.push(`recorded: ${text}`)
    );

    await callback!({ text: '🎲 PEPEMOON 🐸 S 7 - C 9' } as any);

    expect(order).toEqual(['sent: 🎲 PEPEMOON 🐸 S 7 - C 9', 'recorded: 🎲 PEPEMOON 🐸 S 7 - C 9']);
  });

  it('hands back what the send returned', async () => {
    const sent = [{ id: 'memory' }];
    const callback = recordingReplies(async () => sent as any, () => {});
    expect(await callback!({ text: 'hi' } as any)).toBe(sent as any);
  });

  it('records nothing for a reply with no text', async () => {
    const recorded: string[] = [];
    const callback = recordingReplies(async () => [], (text) => recorded.push(text));
    await callback!({ attachments: [] } as any);
    await callback!({ text: '   ' } as any);
    expect(recorded).toEqual([]);
  });

  it('keeps a long reply to a line of conversation', async () => {
    const recorded: string[] = [];
    const callback = recordingReplies(async () => [], (text) => recorded.push(text));
    await callback!({ text: 'x'.repeat(5000) } as any);
    expect(recorded[0].length).toBe(MAX_RECORDED_REPLY_CHARS);
  });

  it('has nothing to wrap without a callback', () => {
    expect(recordingReplies(null, () => {})).toBeUndefined();
  });
});
