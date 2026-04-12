"""Exception classes for the Muninn SDK."""


class MuninnError(Exception):
    """Base exception for all Muninn SDK errors."""

    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class MuninnAuthError(MuninnError):
    """Raised when authentication fails (invalid API key or JWT)."""

    def __init__(self, message: str = "Invalid API key or JWT"):
        super().__init__(message, status_code=401)


class MuninnRateLimitError(MuninnError):
    """Raised when usage limit is exceeded."""

    def __init__(self, message: str = "Usage limit exceeded"):
        super().__init__(message, status_code=429)


class MuninnNotFoundError(MuninnError):
    """Raised when a requested resource is not found."""

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404)


class MuninnServerError(MuninnError):
    """Raised when the API returns a server error."""

    def __init__(self, message: str = "Internal server error"):
        super().__init__(message, status_code=500)


class MuninnValidationError(MuninnError):
    """Raised when request validation fails."""

    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status_code=400)


class MuninnConnectionError(MuninnError):
    """Raised when connection to the API fails."""

    def __init__(self, message: str = "Failed to connect to Muninn API"):
        super().__init__(message, status_code=0)