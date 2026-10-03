/**
 * Plajah / Chora Alexa Skill — Self-Contained Alexa-Hosted Lambda
 *
 * Streams music from Chora on Plajah using the AudioPlayer interface.
 * Queries the public Firestore music catalog directly, so it works reliably
 * even if external APIs are unreachable.
 */

const Alexa = require('ask-sdk-core');
const https = require('https');

// Direct public Firestore runQuery endpoint for Plajah's public music catalog
const FIRESTORE_URL = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents:runQuery';

function queryFirestoreCatalog() {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'albums' }],
        where: { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: 'MUSIC' } } },
        limit: 50
      }
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 4000
    };

    const req = https.request(FIRESTORE_URL, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const tracks = [];
          if (Array.isArray(parsed)) {
            for (const doc of parsed) {
              if (!doc.document || !doc.document.fields) continue;
              const f = doc.document.fields;
              const albumTitle = f.title?.stringValue || '';
              const albumArtist = f.artist?.stringValue || 'Unknown Artist';
              const albumId = (doc.document.name || '').split('/').pop() || 'album';
              const cover = f.coverImage?.stringValue || '';
              const rawTracks = f.tracks?.arrayValue?.values || [];

              rawTracks.forEach((tVal, idx) => {
                const tf = tVal.mapValue?.fields || {};
                const url = tf.url?.stringValue || '';
                if (!url || !url.startsWith('https://')) return;
                tracks.push({
                  id: `${albumId}_${idx}`,
                  title: tf.title?.stringValue || albumTitle || 'Track',
                  artist: tf.artist?.stringValue || albumArtist,
                  albumId,
                  albumTitle,
                  index: idx,
                  url,
                  cover: tf.albumCover?.stringValue || cover,
                  subType: f.subType?.stringValue || tf.subType?.stringValue
                });
              });
            }
          }
          resolve(tracks);
        } catch (e) {
          resolve(getFallbackTracks());
        }
      });
    });

    req.on('error', () => resolve(getFallbackTracks()));
    req.on('timeout', () => { req.destroy(); resolve(getFallbackTracks()); });
    req.write(postData);
    req.end();
  });
}

function getFallbackTracks() {
  return [
    {
      id: 'fallback_1',
      title: 'Sunflowers',
      artist: 'Luna Ray',
      albumId: 'album_sunflowers',
      albumTitle: 'Summer Blooms',
      index: 0,
      url: 'https://plajah.com/audio/sunflowers.mp3',
      cover: 'https://plajah.com/icon.png'
    },
    {
      id: 'fallback_2',
      title: 'Nite Groove Mix',
      artist: 'k-moody',
      albumId: 'album_nite_groove',
      albumTitle: 'Nite Groove 6 dj mix 2015',
      index: 0,
      url: 'https://plajah.com/audio/mix1.mp3',
      cover: 'https://plajah.com/icon.png',
      subType: 'MIX'
    }
  ];
}

function searchTracks(tracks, songQ, artistQ, isMix) {
  if (!tracks || !tracks.length) return null;
  const sq = (songQ || '').toLowerCase().trim();
  const aq = (artistQ || '').toLowerCase().trim();

  if (isMix) {
    const mix = tracks.find(t => t.subType === 'MIX' || t.title.toLowerCase().includes('mix') || t.albumTitle.toLowerCase().includes('mix'));
    if (mix) return mix;
  }

  if (sq) {
    const exact = tracks.find(t => t.title.toLowerCase() === sq);
    if (exact) return exact;
    const partial = tracks.find(t => t.title.toLowerCase().includes(sq) || sq.includes(t.title.toLowerCase()));
    if (partial) return partial;
  }

  if (aq) {
    const byArtist = tracks.find(t => t.artist.toLowerCase().includes(aq) || aq.includes(t.artist.toLowerCase()));
    if (byArtist) return byArtist;
  }

  return tracks[0] || null;
}

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speechText = 'Welcome to Plajah. What would you like to hear on Chora? You can ask me to play a song, an artist, an album, or a mix.';
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt('What would you like me to play on Chora? Say a song or artist name.')
      .withSimpleCard('Welcome to Plajah', 'Ask to play a song, artist, album, or mix on Chora.')
      .getResponse();
  }
};

const PlaySongIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlaySongIntent';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const song = slots.song?.value || '';
    const artist = slots.artist?.value || '';

    if (!song) {
      return handlerInput.responseBuilder
        .speak('What song would you like me to play on Chora?')
        .reprompt('Say the name of a song to play.')
        .getResponse();
    }

    const tracks = await queryFirestoreCatalog();
    const track = searchTracks(tracks, song, artist, false);

    if (!track) {
      return handlerInput.responseBuilder
        .speak(`Sorry, I couldn't find ${song} on Chora.`)
        .getResponse();
    }

    const token = `${track.albumId}::${track.index}`;
    const speechText = `Playing ${track.title} by ${track.artist} on Chora.`;

    const response = handlerInput.responseBuilder
      .speak(speechText)
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        track.url,
        token,
        0,
        null,
        {
          title: track.title,
          subtitle: track.artist,
          art: track.cover ? { sources: [{ url: track.cover }] } : undefined
        }
      );

    if (track.cover) {
      response.withStandardCard(track.title, track.artist, track.cover, track.cover);
    } else {
      response.withSimpleCard(track.title, track.artist);
    }

    return response.getResponse();
  }
};

const PlayArtistIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayArtistIntent';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const artist = slots.artist?.value || '';

    if (!artist) {
      return handlerInput.responseBuilder
        .speak('Which artist would you like to hear on Chora?')
        .reprompt('Say an artist name.')
        .getResponse();
    }

    const tracks = await queryFirestoreCatalog();
    const track = searchTracks(tracks, '', artist, false);

    if (!track) {
      return handlerInput.responseBuilder
        .speak(`Sorry, I couldn't find music by ${artist} on Chora.`)
        .getResponse();
    }

    const token = `${track.albumId}::${track.index}`;
    return handlerInput.responseBuilder
      .speak(`Playing music by ${track.artist} on Chora.`)
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        track.url,
        token,
        0,
        null,
        {
          title: track.title,
          subtitle: track.artist,
          art: track.cover ? { sources: [{ url: track.cover }] } : undefined
        }
      )
      .withSimpleCard(track.title, `Artist: ${track.artist}`)
      .getResponse();
  }
};

const PlayAlbumIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayAlbumIntent';
  },
  async handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const album = slots.album?.value || '';
    const artist = slots.artist?.value || '';

    const tracks = await queryFirestoreCatalog();
    const track = searchTracks(tracks, album, artist, false);

    if (!track) {
      return handlerInput.responseBuilder
        .speak(`Sorry, I couldn't find the album ${album} on Chora.`)
        .getResponse();
    }

    const token = `${track.albumId}::${track.index}`;
    return handlerInput.responseBuilder
      .speak(`Playing the album ${track.albumTitle || album} on Chora.`)
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        track.url,
        token,
        0,
        null,
        {
          title: track.title,
          subtitle: track.artist,
          art: track.cover ? { sources: [{ url: track.cover }] } : undefined
        }
      )
      .withSimpleCard(track.albumTitle || album, `By ${track.artist}`)
      .getResponse();
  }
};

const PlayMixIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayMixIntent';
  },
  async handle(handlerInput) {
    const tracks = await queryFirestoreCatalog();
    const track = searchTracks(tracks, '', '', true);

    if (!track) {
      return handlerInput.responseBuilder
        .speak('Sorry, there are no Chora mixes available right now.')
        .getResponse();
    }

    const token = `${track.albumId}::${track.index}`;
    return handlerInput.responseBuilder
      .speak(`Playing ${track.title} on Chora.`)
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        track.url,
        token,
        0,
        null,
        {
          title: track.title,
          subtitle: track.artist,
          art: track.cover ? { sources: [{ url: track.cover }] } : undefined
        }
      )
      .withSimpleCard(track.title, `Chora Mix • ${track.artist}`)
      .getResponse();
  }
};

const WhatsPlayingIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WhatsPlayingIntent';
  },
  async handle(handlerInput) {
    const ap = handlerInput.requestEnvelope.context.AudioPlayer;
    if (!ap || !ap.token) {
      return handlerInput.responseBuilder
        .speak('Nothing is currently playing on Chora.')
        .getResponse();
    }

    const tracks = await queryFirestoreCatalog();
    const [albumId, idxStr] = String(ap.token).split('::');
    const idx = parseInt(idxStr, 10);
    const track = tracks.find(t => t.albumId === albumId && t.index === idx);

    if (!track) {
      return handlerInput.responseBuilder
        .speak('Unable to determine the current track.')
        .getResponse();
    }

    return handlerInput.responseBuilder
      .speak(`This is ${track.title} by ${track.artist} on Chora.`)
      .getResponse();
  }
};

const PauseIntentHandler = {
  canHandle(handlerInput) {
    const reqType = Alexa.getRequestType(handlerInput.requestEnvelope);
    if (reqType !== 'IntentRequest') return false;
    const name = Alexa.getIntentName(handlerInput.requestEnvelope);
    return name === 'AMAZON.PauseIntent' || name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .addAudioPlayerStopDirective()
      .getResponse();
  }
};

const ResumeIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent';
  },
  async handle(handlerInput) {
    const ap = handlerInput.requestEnvelope.context.AudioPlayer;
    if (!ap || !ap.token) {
      return handlerInput.responseBuilder
        .speak('There is nothing to resume.')
        .getResponse();
    }

    const tracks = await queryFirestoreCatalog();
    const [albumId, idxStr] = String(ap.token).split('::');
    const idx = parseInt(idxStr, 10);
    const track = tracks.find(t => t.albumId === albumId && t.index === idx);

    if (!track) {
      return handlerInput.responseBuilder
        .speak('Unable to resume playback.')
        .getResponse();
    }

    const offset = ap.offsetInMilliseconds || 0;
    return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        track.url,
        ap.token,
        offset,
        null,
        {
          title: track.title,
          subtitle: track.artist,
          art: track.cover ? { sources: [{ url: track.cover }] } : undefined
        }
      )
      .getResponse();
  }
};

const NextIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NextIntent';
  },
  async handle(handlerInput) {
    const ap = handlerInput.requestEnvelope.context.AudioPlayer;
    if (!ap || !ap.token) {
      return handlerInput.responseBuilder
        .speak('Nothing is currently playing.')
        .getResponse();
    }

    const tracks = await queryFirestoreCatalog();
    const [albumId, idxStr] = String(ap.token).split('::');
    const idx = parseInt(idxStr, 10);
    const nextTrack = tracks.find(t => t.albumId === albumId && t.index === idx + 1);

    if (!nextTrack) {
      return handlerInput.responseBuilder
        .speak('That was the last track in this album.')
        .getResponse();
    }

    const token = `${nextTrack.albumId}::${nextTrack.index}`;
    return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        nextTrack.url,
        token,
        0,
        null,
        {
          title: nextTrack.title,
          subtitle: nextTrack.artist,
          art: nextTrack.cover ? { sources: [{ url: nextTrack.cover }] } : undefined
        }
      )
      .getResponse();
  }
};

const PreviousIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PreviousIntent';
  },
  async handle(handlerInput) {
    const ap = handlerInput.requestEnvelope.context.AudioPlayer;
    if (!ap || !ap.token) {
      return handlerInput.responseBuilder
        .speak('Nothing is currently playing.')
        .getResponse();
    }

    const tracks = await queryFirestoreCatalog();
    const [albumId, idxStr] = String(ap.token).split('::');
    const idx = parseInt(idxStr, 10);
    const prevTrack = tracks.find(t => t.albumId === albumId && t.index === idx - 1);

    if (!prevTrack) {
      return handlerInput.responseBuilder
        .speak('This is the first track.')
        .getResponse();
    }

    const token = `${prevTrack.albumId}::${prevTrack.index}`;
    return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective(
        'REPLACE_ALL',
        prevTrack.url,
        token,
        0,
        null,
        {
          title: prevTrack.title,
          subtitle: prevTrack.artist,
          art: prevTrack.cover ? { sources: [{ url: prevTrack.cover }] } : undefined
        }
      )
      .getResponse();
  }
};

const PlaybackNearlyFinishedHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'AudioPlayer.PlaybackNearlyFinished';
  },
  async handle(handlerInput) {
    const currentToken = handlerInput.requestEnvelope.request.token;
    if (!currentToken) return handlerInput.responseBuilder.getResponse();

    const tracks = await queryFirestoreCatalog();
    const [albumId, idxStr] = String(currentToken).split('::');
    const idx = parseInt(idxStr, 10);
    const nextTrack = tracks.find(t => t.albumId === albumId && t.index === idx + 1);

    if (!nextTrack) return handlerInput.responseBuilder.getResponse();

    const nextToken = `${nextTrack.albumId}::${nextTrack.index}`;
    return handlerInput.responseBuilder
      .addAudioPlayerPlayDirective(
        'ENQUEUE',
        nextTrack.url,
        nextToken,
        0,
        currentToken,
        {
          title: nextTrack.title,
          subtitle: nextTrack.artist,
          art: nextTrack.cover ? { sources: [{ url: nextTrack.cover }] } : undefined
        }
      )
      .getResponse();
  }
};

const AudioPlayerEventHandler = {
  canHandle(handlerInput) {
    const reqType = Alexa.getRequestType(handlerInput.requestEnvelope);
    return reqType.startsWith('AudioPlayer.');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speechText = 'You can ask Plajah to play a song on Chora, play music by an artist, play an album, or play a DJ mix. Say pause or next anytime. What would you like to hear?';
    return handlerInput.responseBuilder
      .speak(speechText)
      .reprompt(speechText)
      .getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.error('[Plajah Alexa Error]:', error.stack || error);
    return handlerInput.responseBuilder
      .speak('Sorry, Plajah ran into a problem fulfilling your request.')
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    PlaySongIntentHandler,
    PlayArtistIntentHandler,
    PlayAlbumIntentHandler,
    PlayMixIntentHandler,
    WhatsPlayingIntentHandler,
    PauseIntentHandler,
    ResumeIntentHandler,
    NextIntentHandler,
    PreviousIntentHandler,
    PlaybackNearlyFinishedHandler,
    AudioPlayerEventHandler,
    HelpIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
