#!/usr/bin/env python3
import sys
import json
from http.cookies import SimpleCookie
from typing import List, Dict, Any

try:
    from lanzou.api import LanZouCloud
except Exception:
    print(json.dumps({
        "ok": False,
        "message": "缺少 Python 依赖，请先执行: pip3 install lanzou-api"
    }, ensure_ascii=False))
    sys.exit(1)

def file_to_dict(file_obj: Any, folder_id: int, share_url: str = "") -> Dict[str, Any]:
    return {
        "parent_folder_id": str(folder_id),
        "file_id": str(getattr(file_obj, "id", "")),
        "file_name": str(getattr(file_obj, "name", "")),
        "file_size": str(getattr(file_obj, "size", "")),
        "file_type": str(getattr(file_obj, "type", "")),
        "file_time": str(getattr(file_obj, "time", "")),
        "share_url": share_url or ""
    }

def try_login(lzy: LanZouCloud, payload: Dict[str, Any]) -> None:
    login_type = payload.get("loginType")
    if login_type == "cookie":
        raw_cookie = payload.get("cookie", "").strip()
        if not raw_cookie:
            raise RuntimeError("Cookie 为空")
        cookie_dict = {}
        if raw_cookie.startswith("{"):
            try:
                maybe = json.loads(raw_cookie)
                if isinstance(maybe, dict):
                    cookie_dict = maybe
            except Exception:
                cookie_dict = {}
        if not cookie_dict:
            c = SimpleCookie()
            c.load(raw_cookie)
            for k in ("ylogin", "phpdisk_info"):
                if k in c:
                    cookie_dict[k] = c[k].value
        if not cookie_dict.get("ylogin") or not cookie_dict.get("phpdisk_info"):
            raise RuntimeError("Cookie 缺少 ylogin 或 phpdisk_info")
        code = lzy.login_by_cookie(cookie_dict)
        if code != LanZouCloud.SUCCESS:
            raise RuntimeError(f"Cookie 登录失败，状态码: {code}")
    elif login_type == "account":
        account = payload.get("account", "").strip()
        password = payload.get("password", "").strip()
        if not account or not password:
            raise RuntimeError("账号或密码为空")
        code = lzy.login(account, password)
        if code != LanZouCloud.SUCCESS:
            raise RuntimeError(f"账号登录失败，状态码: {code}")
    else:
        raise RuntimeError("不支持的登录类型")

def safe_share_url(lzy: LanZouCloud, file_id: Any) -> str:
    try:
        share = lzy.get_share_info(file_id, True)
        return getattr(share, "url", "") or ""
    except Exception:
        return ""

def walk(lzy: LanZouCloud, folder_id: int, result: List[Dict[str, Any]]) -> None:
    try:
        files = lzy.get_file_list(folder_id)
    except Exception:
        files = []
    for file_obj in files or []:
        result.append(file_to_dict(file_obj, folder_id, safe_share_url(lzy, getattr(file_obj, "id", ""))))

    try:
        dirs = lzy.get_dir_list(folder_id)
    except Exception:
        dirs = []

    for dir_obj in dirs or []:
        child_id = getattr(dir_obj, "id", None)
        if child_id is None:
            continue
        walk(lzy, int(child_id), result)

def main():
    payload = json.loads(sys.stdin.read() or "{}")
    lzy = LanZouCloud()
    try_login(lzy, payload)

    result: List[Dict[str, Any]] = []
    walk(lzy, -1, result)

    print(json.dumps({
        "ok": True,
        "files": result
    }, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({
            "ok": False,
            "message": str(e)
        }, ensure_ascii=False))
        sys.exit(1)
