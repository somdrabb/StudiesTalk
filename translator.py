from flask import Flask, request, jsonify
from argostranslate import translate

app = Flask(__name__)

HUB_LANG = "en"  # use English as hub

@app.get("/health")
def health():
    return jsonify({"ok": True})

def try_translate(text: str, source: str, target: str) -> str:
    # Argos will throw or return None if model missing
    return translate.translate(text, source, target)

@app.post("/translate")
def translate_text():
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    source = (data.get("source") or "").strip().lower()
    target = (data.get("target") or "").strip().lower()

    if not text or not source or not target:
        return jsonify({"error": "text, source, target required"}), 400

    if source == target:
        return jsonify({"translatedText": text, "status": "none"}), 200

    # 1) direct translation
    try:
        out = try_translate(text, source, target)
        if out:
            return jsonify({"translatedText": out, "status": "ready", "mode": "direct"}), 200
    except Exception as e:
        direct_err = str(e)
    else:
        direct_err = "No direct model installed"

    # 2) hub fallback: source -> en -> target
    try:
        if source != HUB_LANG and target != HUB_LANG:
            mid = try_translate(text, source, HUB_LANG)
            out = try_translate(mid, HUB_LANG, target)
            if out:
                return jsonify({"translatedText": out, "status": "ready", "mode": "hub"}), 200
    except Exception as e:
        hub_err = str(e)
    else:
        hub_err = "No hub model installed"

    return jsonify({
        "translatedText": text,
        "status": "failed",
        "error": "Missing Argos model for requested language pair",
        "details": {
            "source": source,
            "target": target,
            "directError": direct_err,
            "hubError": hub_err
        }
    }), 400

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5005)
