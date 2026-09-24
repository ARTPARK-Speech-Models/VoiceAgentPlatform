import re


class SentenceBoundaryDetector:
    def __init__(self):
        # Abbreviations that should never trigger a split
        self.ABBREVIATIONS = {
            "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc",
            "approx", "dept", "est", "govt", "max", "min", "avg",
            # Indian honorifics
            "sri", "smt", "shri"
        }

        # Sentence ending punctuation
        self.SENTENCE_END = re.compile(r'[!?।\n]|(?<!\d)\.(?!\d)(?!\w)')
        #                                          ↑ Hindi danda
        #                              ↑ never split "3.14" or "e.g."

        self.buffer = ""

    def is_abbreviation(self) -> bool:
        """Check if the last word before a period is a known abbreviation."""
        # Get the last word before the period
        match = re.search(r'\b(\w+)\.\s*$', self.buffer.lower())
        if match:
            return match.group(1) in self.ABBREVIATIONS
        return False

    def is_decimal_or_date(self, upcoming: str = "") -> bool:
        """Check if period is part of a number like 3.14 or date like 23.06"""
        # Period preceded by digit
        if re.search(r'\d\.\s*$', self.buffer):
            return True
        # Period followed by digit (need lookahead from upcoming tokens)
        if upcoming and upcoming[0].isdigit():
            return True
        return False

    def feed(self, token: str, upcoming: str = "") -> list[str]:
        self.buffer += token
        sentences = []
        pos = 0

        while True:
            match = self.SENTENCE_END.search(self.buffer, pos)
            if not match:
                break

            end_pos = match.end()

            if match.group() == '.':
                if self.is_abbreviation():
                    pos = end_pos
                    continue
                if self.is_decimal_or_date(upcoming):
                    pos = end_pos
                    continue

            candidate = self.buffer[:end_pos].strip()
            if candidate:
                sentences.append(candidate)
            self.buffer = self.buffer[end_pos:].lstrip()
            pos = 0

        # Comma-based break for long runs without sentence-ending punctuation
        if not sentences and len(self.buffer) > 120:
            comma_match = re.search(r',\s', self.buffer)
            if comma_match:
                candidate = self.buffer[:comma_match.end()].strip()
                if candidate:
                    sentences.append(candidate)
                self.buffer = self.buffer[comma_match.end():]

        # HARD CEILING: force a break on the nearest word boundary if buffer
        # is still too long and neither sentence nor comma logic fired.
        # This guarantees no single TTS chunk can balloon into a huge audio blob.
        MAX_CHUNK_LEN = 180
        while len(self.buffer) > MAX_CHUNK_LEN:
            # find the last space before the limit to avoid cutting a word in half
            cut = self.buffer.rfind(' ', 0, MAX_CHUNK_LEN)
            if cut == -1:
                cut = MAX_CHUNK_LEN  # no space found — hard cut as last resort
            candidate = self.buffer[:cut].strip()
            if candidate:
                sentences.append(candidate)
            self.buffer = self.buffer[cut:].lstrip()

        return sentences

    def flush(self) -> str | None:
        """Call at stream_end to get any remaining text."""
        remainder = self.buffer.strip()
        self.buffer = ""
        return remainder if remainder else None