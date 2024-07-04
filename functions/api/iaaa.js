// @ts-check
/* eslint-env node */

function parseCookies(response) {
  const raw = response.headers.get("set-cookie");
  
  if (raw === null) {
    // If there are no cookies, return an empty string or handle it as needed
    return '';
  }

  return raw.split(", ")
    .map((entry) => {
      const parts = entry.split(";");
      const cookiePart = parts[0];
      return cookiePart;
    })
    .join("; ");
}


export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const username = url.searchParams.get('username');
  const password = url.searchParams.get('password');
  
  if (!username || !password) {
    return new Response(null, { status: 400 });
  }

  const iaaaParams = new URLSearchParams();
  iaaaParams.append("appid", "portal2017");
  iaaaParams.append("userName", username);
  iaaaParams.append("password", password);
  const REDIR_URL = `https://portal.pku.edu.cn/portal2017/ssoLogin.do`;
  iaaaParams.append("redirUrl", REDIR_URL);

  const loginResponse = await fetch(`https://iaaa.pku.edu.cn/iaaa/oauthlogin.do`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: iaaaParams.toString(),
  });
  const r = await loginResponse.json();

  if (!r.success) {
    return new Response(JSON.stringify({
      success: false,
      errMsg: r.errors.msg,
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log("IAAA: ", r);

  let cookie = null;
  const portalResponse = await fetch(`${REDIR_URL}?token=${r.token}`,{
    redirect: "manual",
  });
  cookie = parseCookies(portalResponse);

  console.log("Portal: ", cookie);
  if (cookie === null) {
    return new Response(JSON.stringify({
      success: false,
      errMsg: "Set-cookie not provided from portal login",
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await fetch("https://portal.pku.edu.cn/portal2017/util/portletRedir.do?portletId=myscores", {
      headers: {
        "cookie": cookie,
      },
      redirect: "manual",
    })
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      errMsg: e instanceof Error ? e.message : e,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const firstStep = await fetch("https://portal.pku.edu.cn/portal2017/util/appSysRedir.do?appId=portalPublicQuery&p1=myScore", {
      "headers": {
        "cookie": cookie,
      },
      redirect: "manual",
    });
    console.log("FirstStep: ", firstStep.status);
    console.log("url: ", firstStep.url);
    console.log("FirstStepHeaders: ", firstStep.headers);
    console.log("RedirectLink: ", firstStep.headers.get("location"));
    let nextStepLink = firstStep.headers.get("location");

    let res = await fetch(`${nextStepLink}`, {
      redirect: "manual",
    });
    console.log("GetNewSessionID: ", res.headers.get("set-cookie"));
    cookie = parseCookies(res);
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      errMsg: e instanceof Error ? e.message : e,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const scoresResponse = await fetch(
    "https://portal.pku.edu.cn/publicQuery/ctrl/topic/myScore/retrScores.do", {
      "headers": {
          "Accept": "application/json, text/plain, */*",
          "Cookie": cookie,
      },
      "referrer": "https://portal.pku.edu.cn/publicQuery/",
      "method": "GET",
      "mode": "cors"
  }
  );
  const r3 = await scoresResponse.text();

  try {
    const result = JSON.parse(r3);
    result.cjxx = result.cjxx.flatMap((c) => c.list);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e instanceof SyntaxError) {
      return new Response(JSON.stringify({
        success: false,
        errMsg: `Portal respond with non-JSON content: ${r3}`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        errMsg: e instanceof Error ? e.message : e,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}