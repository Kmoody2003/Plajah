# Chora on Samsung Bixby (Galaxy & Samsung Smart TVs)

Supports natural voice commands across Samsung Galaxy phones, Samsung Smart TVs, and Galaxy Watches:
- **"Hi Bixby, ask Chora to play Sunflowers"**
- **"Hi Bixby, ask Chora to play music by Luna Ray"**
- **"Hi Bixby, ask Chora to play a DJ mix"**
- **"Hi Bixby, pause Chora"** / **"Hi Bixby, next track on Chora"**

---

## Architecture

1. **Bixby Capsule (`plajah.chora`)**:
   - Capsule manifest: [`bixby/capsule.bxb`](./capsule.bxb)
   - Endpoints configuration: [`bixby/resources/base/endpoints.bxb`](./resources/base/endpoints.bxb)
   - Webhook URL: `https://plajah.com/api/bixby`

2. **Server Fulfillment**:
   - Webhook handler in [`server.ts`](../server.ts) at `POST /api/bixby`
   - Business logic in [`services/bixbyService.ts`](../services/bixbyService.ts)

3. **Samsung Smart TV Integration**:
   - Tizen TV hardware bridge in [`tizen/PlajahTV/tizen-bridge.js`](../tizen/PlajahTV/tizen-bridge.js)
   - Tizen MediaController server publishes metadata to Samsung Quick Settings
   - Tizen TV Bixby Voice API (`webapis.voice`) catches voice commands directly from the Samsung TV Smart Remote.

---

## Deployment to Bixby Developer Studio

1. Download and open **Bixby Developer Studio** (bixbydevelopers.com).
2. Open the `bixby/` folder as a project.
3. In the Bixby Simulator, select target **bixby-mobile-en-US** or **bixby-tv-en-US**.
4. Test voice commands:
   - `ask Chora to play Sunflowers`
   - `ask Chora to play a mix`
5. Submit capsule for Samsung certification under the **Music & Audio** category.
