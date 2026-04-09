from sqlalchemy import Numeric
from sqlalchemy.orm import DeclarativeBase

# Reusable Numeric type for monetary columns: up to 999_999_999_999_999.9999
MONEY = Numeric(19, 4)


class Base(DeclarativeBase):
    pass
