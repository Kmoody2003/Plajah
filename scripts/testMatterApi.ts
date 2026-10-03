async function test() {
  console.log('--- 1. Testing /api/matter/nodes ---');
  let res = await fetch('http://127.0.0.1:3000/api/matter/nodes');
  console.log('Nodes count:', (await res.json()).count);

  console.log('--- 2. Testing /api/matter/parse-code ---');
  res = await fetch('http://127.0.0.1:3000/api/matter/parse-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '34970112332' })
  });
  const parsed = await res.json();
  console.log('Parse Code Result:', JSON.stringify(parsed));

  console.log('--- 3. Testing /api/matter/commission ---');
  res = await fetch('http://127.0.0.1:3000/api/matter/commission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: '34970112332',
      name: 'Living Room Matter Accent Light',
      roomName: 'Living Room'
    })
  });
  const commissionResult = await res.json();
  console.log('Commission Result:', JSON.stringify(commissionResult));

  console.log('--- 4. Testing /api/matter/control ---');
  if (commissionResult.success && commissionResult.node) {
    const nodeId = commissionResult.node.nodeId;
    res = await fetch('http://127.0.0.1:3000/api/matter/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId,
        cluster: 'OnOff',
        command: 'toggle'
      })
    });
    console.log('Control Result:', JSON.stringify(await res.json()));
  }

  console.log('--- 5. Verify /api/matter/nodes has commissioned device ---');
  res = await fetch('http://127.0.0.1:3000/api/matter/nodes');
  const nodesAfter = await res.json();
  console.log('Nodes count after commission:', nodesAfter.count, nodesAfter.nodes.map((n: any) => n.name));
}

test().catch(console.error);
