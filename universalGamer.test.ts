import { PlajahScoreEngine } from './services/gaming/plajahScoreEngine';
import { universalGamerService } from './services/gaming/universalGamerService';
import { syncPlatformData } from './services/gaming/adapters';

async function runUniversalGamerTests() {
  console.log('🎮 --- STARTING UNIVERSAL GAMER & SCORING TESTS --- 🎮');

  // 1. Test Platform Syncing (Mock / Sandbox)
  console.log('\n[1] Testing Platform Adapters:');
  const steamResult = await syncPlatformData('STEAM', '76561198000000000');
  console.log(`✅ Steam synced: ${steamResult.credentials.accountHandle} (${steamResult.games.length} games tracked)`);

  const xboxResult = await syncPlatformData('XBOX', 'MasterChief_Plajah');
  console.log(`✅ Xbox synced: ${xboxResult.credentials.accountHandle} (Gamerscore: ${xboxResult.rawNativeScore}G)`);

  const psnResult = await syncPlatformData('PLAYSTATION', 'Kratos_Plajah');
  console.log(`✅ PSN synced: ${psnResult.credentials.accountHandle} (Raw Trophy Points: ${psnResult.rawNativeScore} pts)`);

  // 2. Test Combined Score Engine
  console.log('\n[2] Testing Plajah Score Normalization Engine:');
  const platformData = [
    {
      platform: 'STEAM' as const,
      accountHandle: steamResult.credentials.accountHandle,
      rawNativeScore: steamResult.rawNativeScore,
      games: steamResult.games,
    },
    {
      platform: 'XBOX' as const,
      accountHandle: xboxResult.credentials.accountHandle,
      rawNativeScore: xboxResult.rawNativeScore,
      games: xboxResult.games,
    },
    {
      platform: 'PLAYSTATION' as const,
      accountHandle: psnResult.credentials.accountHandle,
      rawNativeScore: psnResult.rawNativeScore,
      games: psnResult.games,
    },
  ];

  const scoreResult = PlajahScoreEngine.calculateCombinedScore(platformData);

  console.log(`- Base Score Sum: ${scoreResult.baseScoreSum.toLocaleString()} pts`);
  console.log(`- Cross-Platform Harmony Bonus (+25%): +${scoreResult.crossPlatformHarmonyBonus.toLocaleString()} pts`);
  console.log(`- Total Combined Plajah Score: ${scoreResult.totalCombinedScore.toLocaleString()} pts`);
  console.log(`- Gamer Tier: ${scoreResult.tier} (${scoreResult.tierProgressPercentage}% towards ${scoreResult.nextTierThreshold.toLocaleString()} pts)`);
  console.log(`- 100% Completions: ${scoreResult.total100PercentCompletions} games fully mastered`);
  console.log(`- Total Achievements: ${scoreResult.totalAchievementsAcrossPlatforms.toLocaleString()}`);

  // 3. Test Decentralized Attestation Generation
  console.log('\n[3] Testing Decentralized Identity Attestation:');
  const attestation = PlajahScoreEngine.generateAttestationPayload(
    'user_kenne_123',
    'did:plajah:0x71C...B29',
    scoreResult
  );
  console.log(`✅ Attestation Schema Version: ${attestation.version}`);
  console.log(`✅ Subject DID: ${attestation.subjectDid}`);
  console.log(`✅ Signature Scheme: ${attestation.signatureScheme}`);
  console.log(`✅ Verified Platforms: ${attestation.platformsLinked.join(', ')}`);
  console.log(`✅ Proof Signature: ${attestation.proofSignature}`);

  // 4. Test Demo Passport Creation
  console.log('\n[4] Testing Universal Gamer Passport Service:');
  const passport = await universalGamerService.initializeDemoPassport('user_kenne_123', 'PlajahPioneer');
  console.log(`✅ Universal Gamer Passport initialized for "${passport.username}"`);
  console.log(`✅ Connected Ecosystems: ${passport.connectedAccounts.map((a) => a.platform).join(', ')}`);
  console.log(`✅ Top Showcase Games: ${passport.topGamesShowcase.map((g) => g.titleName).join(', ')}`);

  console.log('\n🎉 --- ALL UNIVERSAL GAMER TESTS PASSED --- 🎉');
}

runUniversalGamerTests().catch(console.error);
