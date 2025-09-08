Purpose
- Build safe SoQL params from allow-listed identifiers and serialized values.

Contract
- Input: fields allow-list, optional select/where/order/group/limit/offset/extra.
- Output: params Record<string,string> with $select/$where/$order/$group/$limit/$offset and sanitized echoes.
- Safety: identifiers must be in fields; values are quoted/escaped; arrays and BETWEEN supported; 4xx/HTTP logic out of scope.

Unsupported (this slice)
- JSON/object values, nested expressions, functions; may be added later.

