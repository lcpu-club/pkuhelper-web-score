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
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
  
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
      "host": "iaaa.pku.edu.cn",
      "user-agent": UA,
      "accept": "application/json, text/javascript, */*; q=0.01",
      "accept-language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
      "accept-encoding": "gzip, br",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "origin": "https://iaaa.pku.edu.cn",
      "dnt": "1",
      "sec-gpc": "1",
      "referer": "https://iaaa.pku.edu.cn/iaaa/oauth.jsp?appID=portal2017&appName=%E5%8C%97%E4%BA%AC%E5%A4%A7%E5%AD%A6%E6%A0%A1%E5%86%85%E4%BF%A1%E6%81%AF%E9%97%A8%E6%88%B7%E6%96%B0%E7%89%88&redirectUrl=https%3A%2F%2Fportal.pku.edu.cn%2Fportal2017%2FssoLogin.do",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "priority": "u=1",
      "te": "trailers",
      "Connection": "close"
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

  const header = {
    "host": "portal.pku.edu.cn",
    "user-agent": UA,
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
    "accept-encoding": "gzip, br",
    "dnt": "1",
    "sec-gpc": "1",
    "referer": "https://portal.pku.edu.cn/portal2017/",
    "cookie": cookie,
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "priority": "u=1",
    "te": "trailers",
    "Connection": "close"
  };

  try {
    await fetch("https://portal.pku.edu.cn/portal2017/util/portletRedir.do?portletId=myscores", {
      headers: header,
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
      "headers": header,
      redirect: "manual",
    })
    console.log("RedirectLink: ", firstStep.headers.get("location"));
    let nextStepLink = firstStep.headers.get("location");

    let res = await fetch(`${nextStepLink}`, {
      redirect: "manual",
    });
    console.log("GetNewSessionID: ", res.headers.get("set-cookie"));
    console.log("GetNewLocation: ", cookie.split(";")[0].split("=")[1]);
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
        "host": "portal.pku.edu.cn",
        "user-agent": UA,
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
        "accept-encoding": "gzip, br",
        "dnt": "1",
        "sec-gpc": "1",
        "referer": `https://portal.pku.edu.cn/publicQuery/;jsessionid=${cookie.split(";")[0].split("=")[1]}`,
        "cookie": cookie,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "te": "trailers",
        "Connection": "close"
      },
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