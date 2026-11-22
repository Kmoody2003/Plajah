// labs/phone/mockCallContext.tsx — Plajah (VoIP) calls are out of scope for the phone lab; just log them.
export const useCall = () => ({
  placeCall: async (room: { id: string }, type?: string) => {
    console.info('[phone-lab] Plajah call', type, room.id);
    alert(`Plajah ${type === 'VIDEO' ? 'video' : 'voice'} call → ${room.id} (real app opens the Plajah call UI)`);
  },
});
