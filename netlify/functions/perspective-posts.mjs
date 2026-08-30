import { getStore } from '@netlify/blobs';
import { getUser, verifyRequestOrigin } from '@netlify/identity';

const STORE_NAME = 'perspective-posts';
const MAX_POSTS = 60;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
    },
  });
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function readRawPosts(store) {
  const { blobs } = await store.list({ prefix: 'post-' });
  return Promise.all(blobs.map(({ key }) => store.get(key, { type: 'json' })));
}

async function readPostsForAuthor(store, authorId) {
  const posts = await readRawPosts(store);
  return posts.filter(post => post && post.status === 'published' && post.authorId === authorId);
}

async function readPosts(store) {
  const posts = await readRawPosts(store);
  return posts
    .filter(post => post && post.status === 'published')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, MAX_POSTS)
    .map(({ authorId, ...post }) => post);
}

function isEditor(user) {
  const roles = user?.roles || user?.app_metadata?.roles || [];
  return roles.includes('admin') || roles.includes('editor');
}

export default async function handler(request) {
  const store = getStore(STORE_NAME);

  if (request.method === 'GET') {
    try {
      return response({ posts: await readPosts(store) });
    } catch (error) {
      console.error('[Perspective] Failed to read posts:', error);
      return response({ error: 'The Perspective feed is temporarily unavailable.' }, 503);
    }
  }

  if (request.method === 'POST') {
    try {
      verifyRequestOrigin(request);
    } catch (error) {
      return response({ error: 'Request origin could not be verified.' }, 403);
    }
    let user;
    try {
      user = await getUser();
    } catch (error) {
      console.error('[Perspective] Identity is unavailable:', error);
      return response({ error: 'Account access is not enabled yet.' }, 503);
    }
    if (!user) return response({ error: 'Sign in to publish under your chosen name.' }, 401);

    let input;
    try {
      input = await request.json();
    } catch (error) {
      return response({ error: 'Please send a valid piece.' }, 400);
    }

    const displayName = clean(input.displayName, 50);
    const title = clean(input.title, 140);
    const body = clean(input.body, 12000);
    if (displayName.length < 2 || title.length < 3 || body.length < 20) {
      return response({ error: 'Add a display name, a title, and at least 20 characters.' }, 400);
    }

    const recentPosts = await readPostsForAuthor(store, user.id);
    if (recentPosts.filter(post => Date.now() - new Date(post.createdAt).getTime() < 60 * 60 * 1000).length >= 8) {
      return response({ error: 'You have reached the hourly posting limit. Take a breath and try again later.' }, 429);
    }

    const id = crypto.randomUUID();
    const post = {
      id,
      displayName,
      title,
      body,
      createdAt: new Date().toISOString(),
      status: 'published',
      authorId: user.id,
    };

    try {
      await store.setJSON(`post-${id}`, post, { onlyIfNew: true, metadata: { status: 'published', authorId: user.id } });
      const { authorId, ...publicPost } = post;
      return response({ post: publicPost }, 201);
    } catch (error) {
      console.error('[Perspective] Failed to publish:', error);
      return response({ error: 'The piece could not be published right now.' }, 503);
    }
  }

  if (request.method === 'DELETE') {
    try {
      verifyRequestOrigin(request);
    } catch (error) {
      return response({ error: 'Request origin could not be verified.' }, 403);
    }
    let user;
    try {
      user = await getUser();
    } catch (error) {
      console.error('[Perspective] Identity is unavailable:', error);
      return response({ error: 'Account access is not enabled yet.' }, 503);
    }
    if (!user || !isEditor(user)) return response({ error: 'Editor access required.' }, 403);
    const id = clean(new URL(request.url).searchParams.get('id'), 100);
    if (!id.startsWith('post-')) return response({ error: 'A valid post is required.' }, 400);
    try {
      await store.delete(id);
      return response({ success: true });
    } catch (error) {
      console.error('[Perspective] Failed to remove post:', error);
      return response({ error: 'The post could not be removed right now.' }, 503);
    }
  }

  return response({ error: 'Method not allowed.' }, 405);
}
