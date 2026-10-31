import re

from rapidfuzz.fuzz import token_set_ratio

WORD = re.compile(r"[\w'-]+", re.UNICODE)


def grounded_question(question: dict, extracted_text: str, skipped_regions: list[dict]) -> bool:
    source = question.get("source_sentence", "").strip()
    answer = str(question.get("answer", "")).strip()
    if not source or not answer:
        return False
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", extracted_text) if s.strip()]
    normalize = lambda value: " ".join(WORD.findall(value)).casefold()
    normalized_source = normalize(source)
    scores = [token_set_ratio(normalize(sentence), normalized_source) for sentence in sentences]
    # Use fuzzy comparison to locate the candidate sentence, then require its
    # normalized words to occur verbatim and in order in the extracted text.
    if not normalized_source or not scores or max(scores) < 90:
        return False
    if not any(normalize(sentence) == normalized_source or normalized_source in normalize(sentence)
               for sentence in sentences):
        return False
    is_tf = question.get("type") == "true_false"
    if is_tf and answer.casefold() not in {"true", "false"}:
        return False
    if not is_tf:
        answer_terms = {w.lower() for w in WORD.findall(answer) if len(w) > 2}
        source_terms = {w.lower() for w in WORD.findall(source)}
        # Answers can be short-form but must be supported by the cited source.
        if not answer_terms or not (answer_terms <= source_terms or token_set_ratio(answer, source) >= 65):
            return False
    excluded_terms = {w.lower() for region in skipped_regions
                      for w in WORD.findall(region.get("caption") or "") if len(w) > 2}
    q_terms = {w.lower() for w in WORD.findall(question.get("question", "") + " " + answer) if len(w) > 2}
    if q_terms & excluded_terms:
        return False
    if question.get("type") == "true_false":
        corpus_terms = {w.lower() for w in WORD.findall(extracted_text)}
        statement_terms = {w.lower() for w in WORD.findall(question.get("question", ""))
                           if len(w) > 2 and w.lower() not in {"true", "false"}}
        if not statement_terms <= corpus_terms:
            return False
    if question.get("type") == "mcq":
        options = question.get("options") or []
        if len(options) != 4 or len({o.casefold() for o in options}) != 4 or answer not in options:
            return False
    return True

