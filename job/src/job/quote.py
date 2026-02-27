"""Domain logic for upholstery quote estimation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

LABOR_RATE_PER_HOUR: Final[float] = 24.0
VAT_RATE: Final[float] = 0.21
URGENT_SURCHARGE_RATE: Final[float] = 0.18
PICKUP_AND_DELIVERY_FEE: Final[float] = 35.0

FURNITURE_BASE_PRICES: Final[dict[str, float]] = {
    "silla": 45.0,
    "sillon": 120.0,
    "sofa_2p": 180.0,
    "sofa_3p": 240.0,
    "cabecero": 95.0,
}

FABRIC_MULTIPLIERS: Final[dict[str, float]] = {
    "economica": 1.0,
    "estandar": 1.25,
    "premium": 1.55,
}


@dataclass(frozen=True)
class QuoteRequest:
    """Input parameters required to estimate an upholstery quote."""

    mueble: str
    horas_mano_obra: float
    nivel_tela: str
    urgente: bool = False
    recogida: bool = False


@dataclass(frozen=True)
class QuoteResult:
    """Calculated quote values and pricing breakdown."""

    base_mueble: float
    costo_mano_obra: float
    multiplicador_tela: float
    recargo_urgencia: float
    costo_recogida: float
    subtotal: float
    iva: float
    total: float


def available_furniture_types() -> tuple[str, ...]:
    """Return valid furniture types accepted by the estimator."""

    return tuple(FURNITURE_BASE_PRICES.keys())


def available_fabric_tiers() -> tuple[str, ...]:
    """Return valid fabric tiers accepted by the estimator."""

    return tuple(FABRIC_MULTIPLIERS.keys())


def estimate_quote(request: QuoteRequest) -> QuoteResult:
    """Estimate a quote for a tapizado service."""

    _validate_request(request)

    base_mueble = FURNITURE_BASE_PRICES[request.mueble]
    costo_mano_obra = request.horas_mano_obra * LABOR_RATE_PER_HOUR
    multiplicador_tela = FABRIC_MULTIPLIERS[request.nivel_tela]

    subtotal_sin_extras = (base_mueble + costo_mano_obra) * multiplicador_tela
    recargo_urgencia = subtotal_sin_extras * URGENT_SURCHARGE_RATE if request.urgente else 0.0
    costo_recogida = PICKUP_AND_DELIVERY_FEE if request.recogida else 0.0

    subtotal = subtotal_sin_extras + recargo_urgencia + costo_recogida
    iva = subtotal * VAT_RATE
    total = subtotal + iva

    return QuoteResult(
        base_mueble=round(base_mueble, 2),
        costo_mano_obra=round(costo_mano_obra, 2),
        multiplicador_tela=round(multiplicador_tela, 2),
        recargo_urgencia=round(recargo_urgencia, 2),
        costo_recogida=round(costo_recogida, 2),
        subtotal=round(subtotal, 2),
        iva=round(iva, 2),
        total=round(total, 2),
    )


def _validate_request(request: QuoteRequest) -> None:
    if request.mueble not in FURNITURE_BASE_PRICES:
        valid_values = ", ".join(available_furniture_types())
        raise ValueError(f"Tipo de mueble invalido: {request.mueble}. Opciones: {valid_values}")

    if request.nivel_tela not in FABRIC_MULTIPLIERS:
        valid_values = ", ".join(available_fabric_tiers())
        raise ValueError(f"Nivel de tela invalido: {request.nivel_tela}. Opciones: {valid_values}")

    if request.horas_mano_obra <= 0:
        raise ValueError("Las horas de mano de obra deben ser mayores que cero.")
