import re

WORD = re.compile(r"[\w'-]+", re.UNICODE)
NON_CONTENT_WORDS = {
    "about", "above", "after", "again", "against", "along", "also", "although", "among",
    "and", "any", "are", "because", "been", "before", "being", "between", "both", "but",
    "can", "could", "did", "does", "each", "for", "from", "had", "has", "have", "her",
    "here", "him", "his", "how", "into", "its", "just", "may", "more", "most", "much",
    "must", "not", "off", "onto", "only", "other", "our", "out", "over", "same", "she",
    "should", "some", "such", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "those", "through", "under", "until", "upon", "very", "was",
    "were", "what", "when", "where", "which", "while", "who", "will", "with", "would",
    "you", "your", "true", "false", "why", "explain", "describe", "identify", "define", "list", "name", "passage", "state", "statement", "following", "text",
}


def _terms(value: str) -> set[str]:
    return {
        normalized for token in WORD.findall(value)
        if (normalized := token.casefold().strip("_"))
        and normalized not in NON_CONTENT_WORDS
        and (len(normalized) > 1 or normalized.isdigit())
    }


def _normalize(value: str) -> str:
    return " ".join(token.casefold() for token in WORD.findall(value))


def _negated_statement(sentence: str) -> str | None:
    if re.search(r"\b(?:not|never|no)\b", sentence, flags=re.I):
        return None
    match = re.search(r"\b(is|are|was|were|has|have|had|can|could|will|would|should|must)\b", sentence, flags=re.I)
    if not match:
        return None
    return sentence[:match.end()] + " not" + sentence[match.end():]

def grounded_question(question: dict, extracted_text: str, skipped_regions: list[dict]) -> bool:
    source = question.get("source_sentence", "").strip()
    prompt = question.get("question", "").strip()
    answer = str(question.get("answer", "")).strip()
    if not source or not prompt or not answer:
        return False

    source_normalized = _normalize(source)
    body_sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+|\n+", extracted_text) if sentence.strip()]
    if not any(_normalize(sentence) == source_normalized for sentence in body_sentences):
        return False

    body_terms = _terms(extracted_text)
    source_terms = _terms(source)
    answer_terms = _terms(answer)
    question_terms = _terms(prompt)
    qtype = question.get("type")
    if qtype != "true_false" and (not answer_terms or not answer_terms <= source_terms):
        return False
    if not question_terms <= body_terms:
        return False

    caption_terms = {
        term for region in skipped_regions
        for term in _terms(region.get("caption") or "")
    }
    if (question_terms | answer_terms) & (caption_terms - body_terms):
        return False

    if qtype == "true_false":
        statement = re.sub(r"^true\s+or\s+false\s*:\s*", "", prompt, flags=re.I).strip()
        if answer.casefold() == "true":
            if _normalize(statement) != source_normalized:
                return False
        elif answer.casefold() == "false":
            expected_false = _negated_statement(source)
            if not expected_false or _normalize(statement) != _normalize(expected_false):
                return False
        else:
            return False

    if qtype == "mcq":
        options = question.get("options") or []
        if len(options) != 4 or len({option.casefold() for option in options}) != 4 or answer not in options:
            return False
        if any(not _terms(option) or not _terms(option) <= body_terms for option in options):
            return False

    return True
