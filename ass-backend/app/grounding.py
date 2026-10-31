import re

from rapidfuzz.fuzz import token_set_ratio

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
    "you", "your",
}


def _content_terms(value: str) -> set[str]:
    return {word.casefold() for word in WORD.findall(value)
            if len(word) > 2 and word.casefold() not in NON_CONTENT_WORDS}


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
    # A term can occur in both a photo caption and the lesson text (e.g.
    # "Ganga" or "rivers"). Reject only caption terms that are absent from
    # retained text; shared vocabulary is grounded by the body text.
    body_terms = _content_terms(extracted_text)
    caption_terms = {term for region in skipped_regions
                     for term in _content_terms(region.get("caption") or "")}
    caption_only_terms = caption_terms - body_terms
    options_text = " ".join(question.get("options") or [])
    question_terms = _content_terms(question.get("question", "") + " " + answer + " " + options_text)
    if question_terms & caption_only_terms:
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

