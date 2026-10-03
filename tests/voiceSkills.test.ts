import {
  handleAlexaRequest,
  searchChora,
  getChoraTrackByToken,
  type ChoraVoiceTrack,
  type AlexaRequest,
} from '../services/alexaService.js';
import {
  handleGoogleActionRequest,
  type GoogleActionRequest,
} from '../services/googleHomeService.js';
import {
  handleBixbyRequest,
  type BixbyRequest,
} from '../services/bixbyService.js';
import { matterCastingService } from '../services/matterCastingService.js';
import { TizenService } from '../services/tizenService.js';

const mockTracks: ChoraVoiceTrack[] = [
  {
    id: 'track-1',
    title: 'Sunflowers',
    artist: 'Luna Ray',
    albumId: 'album-1',
    albumTitle: 'Summer Blooms',
    index: 0,
    url: 'https://cdn.plajah.com/audio/sunflowers.mp3',
    cover: 'https://cdn.plajah.com/images/sunflowers.jpg',
  },
  {
    id: 'track-2',
    title: 'Golden Hour',
    artist: 'Luna Ray',
    albumId: 'album-1',
    albumTitle: 'Summer Blooms',
    index: 1,
    url: 'https://cdn.plajah.com/audio/golden_hour.mp3',
    cover: 'https://cdn.plajah.com/images/sunflowers.jpg',
  },
  {
    id: 'track-3',
    title: 'Midnight Groove',
    artist: 'DJ Neon',
    albumId: 'album-2',
    albumTitle: 'Chora Club Mix Vol 1',
    index: 0,
    url: 'https://cdn.plajah.com/audio/midnight_groove.mp3',
    cover: 'https://cdn.plajah.com/images/club_mix.jpg',
    subType: 'MIX',
  },
];

const mockGetTracks = async () => mockTracks;

async function runTests() {
  console.log('--- 1. Testing Alexa Skill (Plajah / Chora) ---');

  // 1. Alexa LaunchRequest
  const launchReq: AlexaRequest = {
    version: '1.0',
    request: {
      type: 'LaunchRequest',
      requestId: 'req-1',
      timestamp: new Date().toISOString(),
    },
  };
  const launchResp = await handleAlexaRequest(launchReq, mockGetTracks);
  console.log('Launch response speech:', launchResp.response.outputSpeech?.text);
  if (!launchResp.response.outputSpeech?.text?.includes('Welcome to Plajah')) {
    throw new Error('LaunchRequest failed');
  }

  // 2. Alexa PlaySongIntent
  const playSongReq: AlexaRequest = {
    version: '1.0',
    request: {
      type: 'IntentRequest',
      requestId: 'req-2',
      timestamp: new Date().toISOString(),
      intent: {
        name: 'PlaySongIntent',
        slots: {
          song: { name: 'song', value: 'Sunflowers' },
        },
      },
    },
  };
  const playSongResp = await handleAlexaRequest(playSongReq, mockGetTracks);
  console.log('PlaySong speech:', playSongResp.response.outputSpeech?.text);
  const playDirective = playSongResp.response.directives?.[0];
  console.log('Play directive audio stream:', playDirective?.audioItem?.stream?.url);
  if (playDirective?.audioItem?.stream?.url !== 'https://cdn.plajah.com/audio/sunflowers.mp3') {
    throw new Error('PlaySongIntent failed');
  }

  // 3. Alexa Gapless Enqueue (PlaybackNearlyFinished)
  const nearlyFinishedReq: AlexaRequest = {
    version: '1.0',
    request: {
      type: 'AudioPlayer.PlaybackNearlyFinished',
      requestId: 'req-3',
      timestamp: new Date().toISOString(),
      token: 'album-1::0',
    },
  };
  const enqueueResp = await handleAlexaRequest(nearlyFinishedReq, mockGetTracks);
  const enqueueDirective = enqueueResp.response.directives?.[0];
  console.log('Enqueue directive next token:', enqueueDirective?.audioItem?.stream?.token);
  if (enqueueDirective?.audioItem?.stream?.token !== 'album-1::1') {
    throw new Error('PlaybackNearlyFinished queue failed');
  }

  console.log('--- 2. Testing Google Home Action ---');

  // 4. Google Main
  const googleMainReq: GoogleActionRequest = {
    intent: { name: 'actions.intent.MAIN' },
  };
  const googleMainResp = await handleGoogleActionRequest(googleMainReq, mockGetTracks);
  console.log('Google main speech:', googleMainResp.prompt?.firstSimple?.speech);
  if (!googleMainResp.prompt?.firstSimple?.speech?.includes('Welcome to Chora')) {
    throw new Error('Google Main failed');
  }

  // 5. Google PlaySong
  const googlePlayReq: GoogleActionRequest = {
    intent: {
      name: 'PlaySong',
      params: {
        song: { resolved: 'Sunflowers' },
      },
    },
  };
  const googlePlayResp = await handleGoogleActionRequest(googlePlayReq, mockGetTracks);
  const mediaContent = googlePlayResp.prompt?.content?.media;
  console.log('Google media url:', mediaContent?.mediaObjects?.[0]?.url);
  if (mediaContent?.mediaObjects?.[0]?.url !== 'https://cdn.plajah.com/audio/sunflowers.mp3') {
    throw new Error('Google PlaySong failed');
  }

  console.log('--- 3. Testing Samsung Bixby Service ---');

  // 6. Bixby PlaySong
  const bixbyPlayReq: BixbyRequest = {
    action: 'PlaySong',
    params: { song: 'Sunflowers' },
  };
  const bixbyResp = await handleBixbyRequest(bixbyPlayReq, mockGetTracks);
  console.log('Bixby speech:', bixbyResp.dialog.speech);
  console.log('Bixby audio item:', bixbyResp.audioPlayer?.item?.title);
  if (bixbyResp.audioPlayer?.item?.streamUrl !== 'https://cdn.plajah.com/audio/sunflowers.mp3') {
    throw new Error('Bixby PlaySong failed');
  }

  // 7. Bixby PlayMix
  const bixbyMixReq: BixbyRequest = {
    action: 'PlayMix',
  };
  const bixbyMixResp = await handleBixbyRequest(bixbyMixReq, mockGetTracks);
  console.log('Bixby mix title:', bixbyMixResp.audioPlayer?.item?.title);
  if (bixbyMixResp.audioPlayer?.item?.title !== 'Midnight Groove') {
    throw new Error('Bixby PlayMix failed');
  }

  console.log('--- 4. Testing Matter Casting ---');

  // 8. Matter Casting Player Discovery & LaunchURL
  const players = await matterCastingService.startDiscovery();
  console.log('Discovered Matter casting players:', players.length);
  if (players.length === 0) throw new Error('Matter discovery failed');

  const castSuccess = await matterCastingService.castChoraTrack(mockTracks[0]);
  console.log('Matter cast success:', castSuccess);
  console.log('Matter playback state:', matterCastingService.getPlaybackState().state);
  if (!castSuccess || matterCastingService.getPlaybackState().state !== 'PLAYING') {
    throw new Error('Matter casting failed');
  }

  console.log('--- 5. Testing Tizen Samsung Smart TV Bridge ---');
  console.log('Tizen TV detected:', TizenService.isTizen());
  // Test clean callback listener registration
  const cleanup = TizenService.onRemoteCommand({
    onPlay: () => console.log('Tizen onPlay triggered'),
  });
  cleanup();
  console.log('Tizen remote command registration OK');

  console.log('\nAll 5 Platform Voice & Casting Tests Passed Successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
