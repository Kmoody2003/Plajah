// Lulu Print API Integration 
// Documentation: https://developer.lulu.com/

export interface PrintOrderDetails {
  title: string;
  author: string;
  coverUrl: string;
  sourceFileUrl: string; // The PDF book content
  quantity: number;
  shippingAddress: {
    name: string;
    street1: string;
    city: string;
    state?: string;
    country: string;
    postcode: string;
  }
}

export const estimatePrintCost = async (pageCount: number, type: 'PAPERBACK' | 'HARDCOVER' | 'COMIC' = 'PAPERBACK') => {
  // Simulate Lulu Print API Cost calculation
  // Real implementation would query Lulu's print-job-costs endpoint
  // Base cost + per page cost
  const baseCost = type === 'HARDCOVER' ? 12.00 : type === 'COMIC' ? 4.50 : 3.50;
  const perPageCost = type === 'COMIC' ? 0.05 : 0.015;
  const markup = 1.3; // 30% markup for marketplace
  const total = (baseCost + (pageCount * perPageCost)) * markup;
  return Number(total.toFixed(2));
}

export const createPrintOrder = async (order: PrintOrderDetails) => {
  // Real implementation: POST to https://api.lulu.com/print-jobs/
  
  const luluApiKey = (import.meta as any).env.VITE_LULU_API_KEY;
  const luluApiSecret = (import.meta as any).env.VITE_LULU_API_SECRET;

  if (!luluApiKey || !luluApiSecret) {
    // If no keys are provided, we simulate a successful order for preview/demo purposes
    console.warn("Lulu Print API keys not found in environment. Simulating print order.");
    return new Promise((resolve) => setTimeout(() => resolve({
      success: true,
      orderId: `LULU-${Math.floor(Math.random() * 1000000)}`,
      status: 'PROCESSING',
      message: 'Simulated Print Order Created successfully.'
    }), 2000));
  }

  // Real API implementation
  try {
    // 1. Get OAuth Token
    const authString = btoa(`${luluApiKey}:${luluApiSecret}`);
    const tokenRes = await fetch('https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!tokenRes.ok) throw new Error("Failed to authenticate with Lulu API");
    const { access_token } = await tokenRes.json();

    // 2. Create Print Job request
    const printJobPayload = {
      contact_email: "noreply@hive.app",
      external_id: `order-${Date.now()}`,
      line_items: [
        {
          title: order.title,
          quantity: order.quantity,
          page_count: 200, // Replace with actual page count
          pod_package_id: "0600X0900BWSTDPB060UW444MXX", // Example paperback format
          printable_normalization: {
            cover: { source_url: order.coverUrl },
            interior: { source_url: order.sourceFileUrl }
          }
        }
      ],
      shipping_address: {
        name: order.shippingAddress.name,
        street1: order.shippingAddress.street1,
        city: order.shippingAddress.city,
        state_code: order.shippingAddress.state,
        country_code: order.shippingAddress.country,
        postcode: order.shippingAddress.postcode,
      },
      shipping_level: "MAIL"
    };

    const orderRes = await fetch('https://api.lulu.com/print-jobs/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      },
      body: JSON.stringify(printJobPayload)
    });

    if (!orderRes.ok) throw new Error("Failed to create print job");
    const jobData = await orderRes.json();

    return {
      success: true,
      orderId: jobData.id,
      status: jobData.status.name,
      message: 'Print order created successfully.'
    };
  } catch (err: any) {
    console.error("Lulu Order Error:", err);
    throw new Error(err.message || 'Failed to place print order');
  }
}
