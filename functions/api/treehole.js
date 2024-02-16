// @ts-check
/* eslint-env node */

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response(null, {
      status: 400
    });
  }

  try {
    const res = await fetch(
      `https://treehole.pku.edu.cn/api/course/score`,
      {
        headers: {
          "Authorization": `bearer ${token}`
        },
      }
    );
    const text = await res.text();

    try {
      const result = JSON.parse(text);
      return new Response(JSON.stringify(result.data.score), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return new Response(JSON.stringify({
          success: false,
          errMsg: `Treehole respond with non-JSON content: ${text}`,
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          errMsg: e instanceof Error ? e.message : e
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      errMsg: e instanceof Error ? e.message : e
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
