import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyToHostElevateSpoke,
  buildCampaignDisclaimerBox,
  buildNonSmsReminderPayload,
  buildPetitionTelaDossierMarkdown,
  cancelOrReleaseElevateShift,
  checkInElevateShiftVolunteer,
  computeElevateImpactPassport,
  computeSpokeCampaignRollup,
  confirmElevateShiftAttendance24h,
  exportCampaignFinanceComplianceCsv,
  exportElevateMobilizeToCrmCsv,
  getActionHubVerticalConfig,
  getDefaultCivicCampaignComplianceConfig,
  getDefaultElevateMobilizeBundle,
  mapExternalCrmCsvToElevateChms,
  reviewElevateSpokeHostEvent,
  rsvpToElevateSpokeEvent,
  signElevatePetition,
  signUpForElevateShift,
  validateAndRecordCampaignContribution,
  validateCivicCampaignCoalitionFirewall,
  validateCivicCampaignRewardGuard,
} from '../services/elevateMobilizeService';

describe('Plajah Elevate Action & Shifts Engine (Non-SMS)', () => {
  const demoOrg = {
    id: 'org-grace-chapel',
    isDemo: true,
    name: 'Grace Chapel Sanctuary',
    orgType: 'CHURCH' as const,
    ministries: [
      { id: 'min-outreach', name: 'Mercy & Outreach' },
      { id: 'min-worship', name: 'Choir & Ambo Guild' },
    ],
    campuses: [{ id: 'campus-main', name: 'Downtown Sanctuary' }],
  };

  it('seeds multi-shift drives, covenants/petitions, peer spoke campaigns, and CRM sync profiles', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    assert.equal(bundle.orgId, 'org-grace-chapel');
    assert.ok(bundle.shiftDrives.length >= 2);
    assert.ok(bundle.petitions.length >= 2);
    assert.ok(bundle.spokeCampaigns.length >= 1);
    assert.ok(bundle.crmProfiles.length >= 3);
    assert.ok(bundle.spokeCampaigns[0].screeningLicense?.licenseCode.includes('PLAJAH-SPOKE'));
  });

  it('starts a real (non-demo) organization with no sample shifts, petitions, chapters or contributions', () => {
    const bundle = getDefaultElevateMobilizeBundle({ ...demoOrg, id: 'org-real-church', isDemo: false });
    assert.equal(bundle.orgId, 'org-real-church');
    assert.equal(bundle.shiftDrives.length, 0);
    assert.equal(bundle.shiftSignups.length, 0);
    assert.equal(bundle.petitions.length, 0);
    assert.equal(bundle.spokeCampaigns.length, 0);
    assert.equal(bundle.crmProfiles.length, 0);
    assert.equal(bundle.campaignContributions?.length ?? 0, 0);
  });

  it('confirms volunteer signups when capacity is open and queues non-SMS reminders (In-App Push + Post Man Email)', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    const drive = bundle.shiftDrives[0];
    const openSlot = drive.slots[0]; // 3/5 confirmed

    const res = signUpForElevateShift(drive, bundle.shiftSignups, {
      slotId: openSlot.id,
      uid: 'user-new-volunteer',
      userName: 'Micah Sterling',
      userEmail: 'micah@example.org',
      now: 1760950000000,
    });

    assert.equal(res.createdSignup.status, 'CONFIRMED');
    const updatedSlot = res.drive.slots.find(s => s.id === openSlot.id)!;
    assert.equal(updatedSlot.confirmedCount, openSlot.confirmedCount + 1);
    // 72h prep, 24h confirm, and 1h doors non-SMS notifications generated
    assert.equal(res.reminderNotifications.length, 3);
    assert.ok(res.reminderNotifications.every(n => n.channels.includes('IN_APP_PUSH')));
    assert.ok(res.reminderNotifications.every(n => n.channels.includes('POST_MAN_EMAIL')));
  });

  it('places volunteers on the waitlist when a slot is full and automatically promotes the earliest waitlisted volunteer when a seat is released', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    const drive = bundle.shiftDrives[0];
    const fullSlot = drive.slots[1]; // capacity 2, confirmedCount 2, waitlistCount 1 (Grace Okafor)

    // Another user signs up for the full slot -> lands on WAITLISTED
    const waitRes = signUpForElevateShift(drive, bundle.shiftSignups, {
      slotId: fullSlot.id,
      uid: 'user-wait-2',
      userName: 'Tasha Brooks',
      now: 1760950000000,
    });
    assert.equal(waitRes.createdSignup.status, 'WAITLISTED');

    // Now a confirmed volunteer (Marcus Bell, signup_2) releases their seat
    const confirmedSignup = waitRes.signups.find(
      s => s.slotId === fullSlot.id && s.status === 'CONFIRMED'
    )!;
    const cancelRes = cancelOrReleaseElevateShift(
      waitRes.drive,
      waitRes.signups,
      confirmedSignup.id,
      1760960000000
    );

    assert.equal(cancelRes.cancelledSignup.status, 'CANCELLED');
    assert.ok(cancelRes.promotedSignup, 'Expected earliest waitlisted volunteer to be auto-promoted');
    assert.equal(cancelRes.promotedSignup?.userName, 'Grace Okafor');
    assert.equal(cancelRes.promotedSignup?.status, 'CONFIRMED');
    assert.equal(cancelRes.promotionNotification?.stage, 'WAITLIST_PROMOTED');
  });

  it('verifies shift check-in, stamps ChmsAttendance, unlocks Sanctuary rewards, and triggers post-event ARIA & Photo Pool synergy', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    const drive = bundle.shiftDrives[0];
    const confirmedSignup = bundle.shiftSignups.find(s => s.status === 'CONFIRMED')!;

    const confirmedList = confirmElevateShiftAttendance24h(
      bundle.shiftSignups,
      confirmedSignup.id
    );
    assert.equal(
      confirmedList.find(s => s.id === confirmedSignup.id)?.confirmedAttendance24h,
      true
    );

    const checkInRes = checkInElevateShiftVolunteer(
      drive,
      confirmedList,
      confirmedSignup.id,
      'SANCTUARY_GEOFENCE',
      1760970000000
    );

    assert.equal(checkInRes.completedSignup.status, 'COMPLETED');
    assert.equal(checkInRes.completedSignup.verifiedHours, 2.5);
    assert.ok(checkInRes.completedSignup.unlockedRewardTitle?.includes('Hospitality'));
    assert.equal(checkInRes.chmsAttendanceRecord.personId, confirmedSignup.uid);
    assert.equal(checkInRes.postEventNotification.stage, 'POST_EVENT_SYNERGY');
    assert.ok(checkInRes.postEventNotification.ariaRepurposeJobDraft);
    assert.ok(checkInRes.postEventNotification.photoPoolPrompt);
  });

  it('records verified petition/covenant signatures with 30s voice testimonies, unlocks sponsor milestones, and exports Tela Dossiers', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    const covenant = bundle.petitions[0]; // 248 signatures, milestone at 250 ($5,000 match)

    const sig1 = signElevatePetition(covenant, bundle.petitionSignatures, {
      uid: 'signer-249',
      signerName: 'Deacon Paul',
      testimonyKind: 'VOICE_30S',
      testimonyDurationSec: 27,
      pledgedHours: 12,
    });
    assert.equal(sig1.petition.signatureCount, 249);
    assert.equal(sig1.newlyUnlockedMilestones.length, 0);

    const sig2 = signElevatePetition(sig1.petition, sig1.signatures, {
      uid: 'signer-250',
      signerName: 'Sister Ruth',
      comment: 'Unlocking the $5,000 benevolence match!',
      testimonyKind: 'VIDEO_30S',
      testimonyDurationSec: 30,
      pledgedHours: 8,
    });
    assert.equal(sig2.petition.signatureCount, 250);
    assert.equal(sig2.newlyUnlockedMilestones.length, 1);
    assert.equal(sig2.newlyUnlockedMilestones[0].matchAmountUsd, 5000);

    const markdown = buildPetitionTelaDossierMarkdown(sig2.petition, sig2.signatures);
    assert.ok(markdown.includes('# Grace Chapel Sanctuary 1,000-Hour Neighbor Mercy'));
    assert.ok(markdown.includes('$5,000 USD'));
    assert.ok(markdown.includes('Sister Ruth'));
  });

  it('manages distributed peer-to-peer spoke watch party applications, host vetting, RSVPs, and rollup metrics', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    const camp = bundle.spokeCampaigns[0];

    const hostRes = applyToHostElevateSpoke(camp, {
      hostUid: 'host-new-1',
      hostName: 'Brother Isaiah',
      title: 'College Park Living Room Revival Watch Party',
      city: 'College Park, GA',
      neighborhood: 'Historic District',
      venueKind: 'HOME_SANCTUARY',
      dateISO: '2026-11-05',
      timeLabel: '07:00 PM',
      capacity: 25,
    });
    assert.equal(hostRes.createdSpoke.status, 'PENDING_VETTING');

    const approvedCamp = reviewElevateSpokeHostEvent(
      hostRes.campaign,
      hostRes.createdSpoke.id,
      'APPROVE'
    );
    const rsvpedCamp = rsvpToElevateSpokeEvent(approvedCamp, hostRes.createdSpoke.id);
    const rollup = computeSpokeCampaignRollup(rsvpedCamp);

    assert.equal(rollup.approvedLiveSpokes, 3);
    assert.ok(rollup.citiesReached.includes('College Park, GA'));
  });

  it('computes Member Impact Passports and maps external CRM CSVs bi-directionally', () => {
    const bundle = getDefaultElevateMobilizeBundle(demoOrg);
    const passport = computeElevateImpactPassport(
      'demo-member-elena',
      demoOrg.id,
      bundle.shiftDrives,
      bundle.shiftSignups,
      bundle.petitions,
      bundle.petitionSignatures,
      bundle.spokeCampaigns
    );
    assert.equal(passport.verifiedVolunteerHours, 2);
    assert.ok(passport.plajahPointsEarned >= 120);
    assert.ok(passport.unlockedRewards.length >= 1);

    const sampleCsv =
      'first_name,last_name,email,phone,tags,external_id\nHannah,Abbott,hannah@example.org,555-0100,Usher;Prayer,van_77';
    const chmsPeople = mapExternalCrmCsvToElevateChms(
      'NGP_VAN_EVERYACTION',
      sampleCsv,
      demoOrg.id
    );
    assert.equal(chmsPeople.length, 1);
    assert.equal(chmsPeople[0].firstName, 'Hannah');
    assert.ok(chmsPeople[0].tags?.includes('CRM:NGP_VAN_EVERYACTION'));

    const exportedCsv = exportElevateMobilizeToCrmCsv(
      'NGP_VAN_EVERYACTION',
      demoOrg.id,
      bundle.shiftSignups,
      bundle.petitionSignatures
    );
    assert.ok(exportedCsv.includes('VOLUNTEER_SHIFT'));
    assert.ok(exportedCsv.includes('PETITION_COVENANT_SIGNATURE'));
  });

  it('provides adaptive vertical vocabulary across Faith, Nonprofit, Cultural, Academia, Clubs, and Business without using the word Mobilize', () => {
    const kinds = [
      'CHURCH',
      'NONPROFIT',
      'CULTURAL',
      'ACADEMIA',
      'CLUB',
      'BUSINESS',
    ] as const;

    for (const k of kinds) {
      const cfg = getActionHubVerticalConfig(k);
      const serialized = JSON.stringify(cfg).toLowerCase();
      assert.equal(
        serialized.includes('mobilize'),
        false,
        `Expected vertical config for ${k} not to include 'mobilize'`
      );
    }

    assert.equal(getActionHubVerticalConfig('CHURCH').publicTabLabel, 'Serve & Action');
    assert.equal(getActionHubVerticalConfig('NONPROFIT').publicTabLabel, 'Take Action');
    assert.equal(getActionHubVerticalConfig('CULTURAL').publicTabLabel, 'Docents & Action');
    assert.equal(getActionHubVerticalConfig('CIVIC_CAMPAIGN').publicTabLabel, 'Volunteer & Canvass');
    assert.equal(getActionHubVerticalConfig('ACADEMIA').publicTabLabel, 'Service & Chapters');
    assert.equal(getActionHubVerticalConfig('CLUB').publicTabLabel, 'Meetups & Crew');
    assert.equal(getActionHubVerticalConfig('BUSINESS').publicTabLabel, 'Ambassadors & Pop-Ups');
  });

  it('enforces Grassroots & Civic Campaign Compliance guardrails (501c3 firewall, 18 U.S.C. 597 reward guard, FEC/local contribution gate, and Paid-For-By box)', () => {
    const cfg = getDefaultCivicCampaignComplianceConfig('Jordan Vance for District 4');
    const disclaimer = buildCampaignDisclaimerBox(cfg);
    assert.ok(disclaimer.headlineBoxText.includes('PAID FOR BY'));
    assert.ok(disclaimer.headlineBoxText.includes('TREASURER'));
    assert.ok(disclaimer.taxNotice.includes('NOT tax-deductible'));

    // 1. 501(c)(3) Johnson Amendment Firewall
    const blockedCoalition = validateCivicCampaignCoalitionFirewall('527_CANDIDATE_COMMITTEE', [
      '501C4_CIVIC_ACTION',
      '501C3_PUBLIC_CHARITY',
    ]);
    assert.equal(blockedCoalition.allowed, false);
    assert.equal(blockedCoalition.blockedCount, 1);

    const safeCoalition = validateCivicCampaignCoalitionFirewall('527_CANDIDATE_COMMITTEE', [
      '501C4_CIVIC_ACTION',
    ]);
    assert.equal(safeCoalition.allowed, true);

    // 2. 18 U.S.C. § 597 Anti-Vote-Buying Reward Guard
    assert.equal(validateCivicCampaignRewardGuard('VOLUNTEER_LABOR_SHIFT', true).allowed, true);
    assert.equal(validateCivicCampaignRewardGuard('VOTER_REGISTRATION', true).allowed, false);
    assert.equal(validateCivicCampaignRewardGuard('VOTE_PLEDGE', true).allowed, false);
    assert.equal(validateCivicCampaignRewardGuard('BALLOT_RETURN', true).allowed, false);

    // 3. FEC / Local Contribution Gate (rejects P.O. Box, missing occupation, or over-limit aggregate)
    const poBoxAttempt = validateAndRecordCampaignContribution(cfg, [], {
      orgId: 'org-d4',
      donorFullName: 'Alex Mercer',
      donorEmail: 'alex@example.org',
      streetAddress: 'P.O. Box 1422',
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30303',
      occupation: 'Architect',
      employer: 'Mercer Studio',
      amountUsd: 100,
      electionCycle: cfg.electionCycleLabel,
      attestation: {
        isUsCitizenOrPermanentResident: true,
        isPersonalFunds: true,
        isNotFederalOrMunicipalContractor: true,
        isPersonalCardNotCorporate: true,
        isAtLeast18: true,
      },
    });
    assert.equal(poBoxAttempt.ok, false);
    assert.ok(poBoxAttempt.errors.some(e => e.includes('P.O. Boxes')));

    const validContrib = validateAndRecordCampaignContribution(cfg, [], {
      orgId: 'org-d4',
      donorFullName: 'Alex Mercer',
      donorEmail: 'alex@example.org',
      streetAddress: '510 Piedmont Ave NE',
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30308',
      occupation: 'Architect',
      employer: 'Mercer Studio',
      amountUsd: 250,
      electionCycle: cfg.electionCycleLabel,
      attestation: {
        isUsCitizenOrPermanentResident: true,
        isPersonalFunds: true,
        isNotFederalOrMunicipalContractor: true,
        isPersonalCardNotCorporate: true,
        isAtLeast18: true,
      },
    });
    assert.equal(validContrib.ok, true);
    assert.equal(validContrib.record?.aggregateCycleToDateUsd, 250);

    // Over-limit aggregate contribution ($3,200 + $250 = $3,450 > $3,300 limit)
    const overLimitAttempt = validateAndRecordCampaignContribution(
      cfg,
      validContrib.updatedContributions,
      {
        orgId: 'org-d4',
        donorFullName: 'Alex Mercer',
        donorEmail: 'alex@example.org',
        streetAddress: '510 Piedmont Ave NE',
        city: 'Atlanta',
        state: 'GA',
        postalCode: '30308',
        occupation: 'Architect',
        employer: 'Mercer Studio',
        amountUsd: 3200,
        electionCycle: cfg.electionCycleLabel,
        attestation: {
          isUsCitizenOrPermanentResident: true,
          isPersonalFunds: true,
          isNotFederalOrMunicipalContractor: true,
          isPersonalCardNotCorporate: true,
          isAtLeast18: true,
        },
      }
    );
    assert.equal(overLimitAttempt.ok, false);
    assert.ok(overLimitAttempt.errors.some(e => e.includes('aggregate limit')));

    const csv = exportCampaignFinanceComplianceCsv(cfg, validContrib.updatedContributions);
    assert.ok(csv.includes('Occupation,Employer'));
    assert.ok(csv.includes('Architect'));
  });
});

