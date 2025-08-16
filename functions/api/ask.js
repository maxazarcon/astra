export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') {
        return new Response('Expected POST', { status: 405 });
    }
    
    const { prompt } = await request.json();

    const response = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [{ role: 'user', content: prompt }]
    });

    return Response.json({ answer: response.response });
}