import { describe, it, expect } from 'bun:test';
import { fileIdKind, dropGifVideoIds } from '../../utils/telegramFileIdCache';
import { getAnyCardInfo } from '../../data/allCardsIndex';

// FAKEVIBES as the test bot cached it: a GIF uploaded as "animation.mp4",
// which Telegram stored as a 320x320 video lasting zero seconds.
const BROKEN_GIF_VIDEO = 'BAACAgEAAxkDAAIPOmkRUW-BlHTRvhCmfkIg56RKd7vjAAJmBQACXlSIRLpBrO8PVT83NgQ';
const ANIMATION = 'CgACAgEAAxkDAAIPQGkRUXx0000000000000000000000AAJoBQACXlSIRA000000000NgQ';
const DOCUMENT = 'BQACAgEAAxkDAAIPQWkRUXx0000000000000000000000AAJpBQACXlSIRA000000000NgQ';
const PHOTO = 'AgACAgEAAxkDAAIPQmkRUXx0000000000000000000000AAJqBQACXlSIRA000000000NgQ';

describe('fileIdKind', () => {
  it('reads the kind from the id, not from the card it was cached for', () => {
    expect(fileIdKind(BROKEN_GIF_VIDEO)).toBe('video');
    expect(fileIdKind(ANIMATION)).toBe('animation');
    expect(fileIdKind(DOCUMENT)).toBe('document');
    expect(fileIdKind(PHOTO)).toBe('photo');
  });

  it('a video id is not a document', () => {
    // The old check treated "BAAC" as a document and sent it with sendDocument,
    // which the official channel refuses.
    expect(fileIdKind(BROKEN_GIF_VIDEO)).not.toBe('document');
  });

  it('knows nothing about an empty or unrecognised id', () => {
    expect(fileIdKind(null)).toBeNull();
    expect(fileIdKind('')).toBeNull();
    expect(fileIdKind('AAAAAAAA')).toBeNull();
  });
});

describe('dropGifVideoIds', () => {
  const exts: Record<string, string> = {
    FAKEVIBES: 'gif',
    SHOUTYGIF: 'GIF',
    LOOPINGGIF: 'gif',
    REALVIDEO: 'mp4',
    STILLCARD: 'jpg',
  };

  it('drops video ids on GIF cards and nothing else', () => {
    const cache: Record<string, string> = {
      FAKEVIBES: BROKEN_GIF_VIDEO,
      SHOUTYGIF: BROKEN_GIF_VIDEO,
      LOOPINGGIF: ANIMATION,
      REALVIDEO: BROKEN_GIF_VIDEO,
      STILLCARD: PHOTO,
      NOTINDEXED: BROKEN_GIF_VIDEO,
    };

    const dropped = dropGifVideoIds(cache, (asset) => exts[asset]);

    expect(dropped.sort()).toEqual(['FAKEVIBES', 'SHOUTYGIF']);
    expect(Object.keys(cache).sort()).toEqual(['LOOPINGGIF', 'NOTINDEXED', 'REALVIDEO', 'STILLCARD']);
  });

  it('finds nothing to drop the second time', () => {
    const cache: Record<string, string> = { FAKEVIBES: BROKEN_GIF_VIDEO };
    dropGifVideoIds(cache, (asset) => exts[asset]);
    expect(dropGifVideoIds(cache, (asset) => exts[asset])).toEqual([]);
  });

  it('can see a card extension through the all-collections index', () => {
    expect(getAnyCardInfo('FAKEVIBES')?.ext).toBe('gif');
  });
});
