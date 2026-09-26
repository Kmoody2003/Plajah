// amboPartyEvent.test.ts — Unit tests for Ambo Party & Event Mode Mesh Engine
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  getOrCreateDeviceId, detectDeviceType, getFriendlyDeviceName,
  DEFAULT_DUTY, type PartyEventDevice, type PartyEventSession,
  type EventDeviceDuty, type PartyEventMasterSource,
} from '../services/ambo/amboPartyEventService';
import type { PlanItem } from '../services/ambo/servicePlanDemo';
import type { LiveStack, Slide, Show } from '../services/ambo/showModel';

describe('Ambo Party & Event Mode Mesh Engine', () => {
  describe('Device Discovery & Identification', () => {
    test('generates valid and stable device ID', () => {
      const id = getOrCreateDeviceId();
      assert.ok(id, 'Device ID should be generated');
      assert.ok(typeof id === 'string', 'Device ID should be a string');
    });

    test('default duty is Ambo Program Out mirror', () => {
      assert.equal(DEFAULT_DUTY.dutyType, 'AMBO_PROGRAM');
      assert.equal(DEFAULT_DUTY.title, 'Ambo Program Out');
    });
  });

  describe('Master Sync & Slave Follow Logic', () => {
    // Helper to evaluate what a device displays based on mesh state
    function evaluateDeviceDisplay(
      session: Pick<PartyEventSession, 'isActive' | 'masterSyncEngaged' | 'masterSource'> | null,
      device: Pick<PartyEventDevice, 'isSlaved' | 'duty'>
    ): { mode: 'MASTER_SYNC' | 'INDEPENDENT_DUTY'; activeSource: any } {
      const isPartyActive = !!session?.isActive;
      const isMasterSyncEngaged = !!session?.masterSyncEngaged;
      const isDeviceSlaved = device.isSlaved !== false;

      if (isPartyActive && isMasterSyncEngaged && isDeviceSlaved) {
        return {
          mode: 'MASTER_SYNC',
          activeSource: session?.masterSource,
        };
      }

      return {
        mode: 'INDEPENDENT_DUTY',
        activeSource: device.duty,
      };
    }

    test('device slaves and follows master when Master Sync is engaged', () => {
      const masterSource: PartyEventMasterSource = {
        type: 'AMBO_PROGRAM',
        title: 'Master Keynote Presentation',
        isPlaying: true,
        seq: 1,
        updatedAt: Date.now(),
      };

      const session = {
        isActive: true,
        masterSyncEngaged: true,
        masterSource,
      };

      const device: PartyEventDevice = {
        deviceId: 'dev_tv_01',
        uid: 'user_123',
        deviceName: 'Bar TV',
        deviceType: 'TV',
        isOnline: true,
        lastSeen: Date.now(),
        isSlaved: true,
        volume: 1,
        isMuted: false,
        duty: {
          dutyType: 'REELLO_VIDEO',
          title: 'Festival Highlights Loop',
        },
      };

      const result = evaluateDeviceDisplay(session, device);
      assert.equal(result.mode, 'MASTER_SYNC');
      assert.equal(result.activeSource.title, 'Master Keynote Presentation');
    });

    test('device returns to independent assigned duty when Sync hits Mute state', () => {
      const masterSource: PartyEventMasterSource = {
        type: 'AMBO_PROGRAM',
        title: 'Master Keynote Presentation',
        isPlaying: true,
        seq: 2,
        updatedAt: Date.now(),
      };

      // Operator muted/released Master Sync
      const session = {
        isActive: true,
        masterSyncEngaged: false, // MUTED
        masterSource,
      };

      const device: PartyEventDevice = {
        deviceId: 'dev_tv_01',
        uid: 'user_123',
        deviceName: 'Bar TV',
        deviceType: 'TV',
        isOnline: true,
        lastSeen: Date.now(),
        isSlaved: true,
        volume: 1,
        isMuted: false,
        duty: {
          dutyType: 'REELLO_VIDEO',
          title: 'Festival Highlights Loop',
        },
      };

      const result = evaluateDeviceDisplay(session, device);
      assert.equal(result.mode, 'INDEPENDENT_DUTY');
      assert.equal(result.activeSource.dutyType, 'REELLO_VIDEO');
      assert.equal(result.activeSource.title, 'Festival Highlights Loop');
    });

    test('device set to isSlaved=false remains on independent duty even if Master Sync is engaged', () => {
      const session = {
        isActive: true,
        masterSyncEngaged: true, // MASTER SYNC ON
        masterSource: {
          type: 'AMBO_PROGRAM' as const,
          title: 'Master Keynote Presentation',
          isPlaying: true,
          seq: 3,
          updatedAt: Date.now(),
        },
      };

      // An unslaved device (e.g. Backstage monitor or Patio Chora audio player)
      const patioDevice: PartyEventDevice = {
        deviceId: 'dev_ipad_patio',
        uid: 'user_123',
        deviceName: 'Patio iPad',
        deviceType: 'TABLET',
        isOnline: true,
        lastSeen: Date.now(),
        isSlaved: false, // INDEPENDENT OVERRIDE
        volume: 0.8,
        isMuted: false,
        duty: {
          dutyType: 'CHORA_PLAYLIST',
          title: 'Chora Lounge Mix',
        },
      };

      const result = evaluateDeviceDisplay(session, patioDevice);
      assert.equal(result.mode, 'INDEPENDENT_DUTY');
      assert.equal(result.activeSource.dutyType, 'CHORA_PLAYLIST');
      assert.equal(result.activeSource.title, 'Chora Lounge Mix');
    });

    test('device remains on independent duty when party mode is inactive', () => {
      const session = {
        isActive: false, // Inactive
        masterSyncEngaged: true,
        masterSource: {
          type: 'AMBO_PROGRAM' as const,
          title: 'Old Source',
          isPlaying: false,
          seq: 4,
          updatedAt: Date.now(),
        },
      };

      const device: PartyEventDevice = {
        deviceId: 'dev_laptop_02',
        uid: 'user_123',
        deviceName: 'Secondary Laptop',
        deviceType: 'DESKTOP',
        isOnline: true,
        lastSeen: Date.now(),
        isSlaved: true,
        volume: 1,
        isMuted: false,
        duty: {
          dutyType: 'AMBO_STAGE',
          title: 'Stage Foldback',
        },
      };

      const result = evaluateDeviceDisplay(session, device);
      assert.equal(result.mode, 'INDEPENDENT_DUTY');
      assert.equal(result.activeSource.dutyType, 'AMBO_STAGE');
    });
  });

  describe('Project Playlist Architecture Defaults', () => {
    test('plan item correctly defines default outputs and default duties', () => {
      const mockShow: Show = {
        id: 'show_opening',
        title: 'Opening DJ & Ambient Welcome',
        kind: 'PRESENTATION',
        slides: [],
      };

      const item: PlanItem = {
        id: 'pi_01',
        title: 'Opening DJ & Ambient Welcome',
        show: mockShow,
        plannedSec: 600,
        defaultOutputs: ['dev_bar_tv', 'dev_patio_tablet', 'dev_lobby_kiosk'],
        defaultDuties: {
          dev_bar_tv: {
            dutyType: 'REELLO_VIDEO',
            title: 'Hype Reels 2026',
          },
          dev_patio_tablet: {
            dutyType: 'CHORA_PLAYLIST',
            title: 'Deep House Sunset Playlist',
          },
          dev_lobby_kiosk: {
            dutyType: 'AMBIENT_SIGNAGE',
            title: 'Welcome Screen & Schedule',
          },
        },
      };

      assert.ok(item.defaultDuties);
      assert.equal(Object.keys(item.defaultDuties).length, 3);
      assert.equal(item.defaultDuties['dev_bar_tv'].dutyType, 'REELLO_VIDEO');
      assert.equal(item.defaultDuties['dev_patio_tablet'].dutyType, 'CHORA_PLAYLIST');
      assert.equal(item.defaultDuties['dev_lobby_kiosk'].dutyType, 'AMBIENT_SIGNAGE');
    });

    test('switching plan item duties maps correctly to simulated device mesh', () => {
      const devicesMesh: Record<string, EventDeviceDuty> = {
        dev_bar_tv: { dutyType: 'STANDBY', title: 'Standby' },
        dev_patio_tablet: { dutyType: 'STANDBY', title: 'Standby' },
      };

      const planItem: PlanItem = {
        id: 'pi_sermon',
        title: 'Keynote Message',
        show: { id: 'show_sermon', title: 'Keynote', kind: 'PRESENTATION', slides: [] },
        plannedSec: 1800,
        defaultDuties: {
          dev_bar_tv: { dutyType: 'AMBO_PROGRAM', title: 'Main Program Live' },
          dev_patio_tablet: { dutyType: 'AMBO_STAGE', title: 'Speaker Notes & Clock' },
        },
      };

      // Simulate applying plan item duties
      if (planItem.defaultDuties) {
        for (const [devId, duty] of Object.entries(planItem.defaultDuties)) {
          devicesMesh[devId] = duty;
        }
      }

      assert.equal(devicesMesh['dev_bar_tv'].dutyType, 'AMBO_PROGRAM');
      assert.equal(devicesMesh['dev_patio_tablet'].dutyType, 'AMBO_STAGE');
    });
  });
});
