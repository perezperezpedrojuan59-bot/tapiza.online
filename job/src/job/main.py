"""CLI entry point for tapiza.online."""

from __future__ import annotations

import argparse

from job.quote import (
    QuoteRequest,
    QuoteResult,
    available_fabric_tiers,
    available_furniture_types,
    estimate_quote,
)


def get_project_name() -> str:
    """Return the canonical project name."""

    return "tapiza.online"


def build_parser() -> argparse.ArgumentParser:
    """Build command line parser for the MVP CLI."""

    parser = argparse.ArgumentParser(
        prog="tapiza",
        description="Cotizador inicial para servicios de tapizado.",
    )
    subparsers = parser.add_subparsers(dest="command")

    cotizar_parser = subparsers.add_parser(
        "cotizar",
        help="Genera una cotizacion estimada",
    )
    cotizar_parser.add_argument(
        "--mueble",
        required=True,
        choices=available_furniture_types(),
        help="Tipo de mueble a tapizar",
    )
    cotizar_parser.add_argument(
        "--horas",
        required=True,
        type=float,
        help="Horas estimadas de mano de obra",
    )
    cotizar_parser.add_argument(
        "--tela",
        required=True,
        choices=available_fabric_tiers(),
        help="Nivel de tela",
    )
    cotizar_parser.add_argument(
        "--urgente",
        action="store_true",
        help="Aplica recargo por entrega urgente",
    )
    cotizar_parser.add_argument(
        "--recogida",
        action="store_true",
        help="Incluye recogida y entrega",
    )
    return parser


def format_quote(
    request: QuoteRequest,
    result: QuoteResult,
) -> str:
    """Format quote output for CLI rendering."""

    lines = [
        "=== Cotizacion tapiza.online ===",
        f"Mueble: {request.mueble}",
        f"Horas mano de obra: {request.horas_mano_obra}",
        f"Nivel tela: {request.nivel_tela}",
        f"Urgente: {'si' if request.urgente else 'no'}",
        f"Recogida/entrega: {'si' if request.recogida else 'no'}",
        "",
        f"Base mueble: {result.base_mueble:.2f} EUR",
        f"Mano de obra: {result.costo_mano_obra:.2f} EUR",
        f"Multiplicador tela: x{result.multiplicador_tela:.2f}",
        f"Recargo urgencia: {result.recargo_urgencia:.2f} EUR",
        f"Recogida/entrega: {result.costo_recogida:.2f} EUR",
        f"Subtotal: {result.subtotal:.2f} EUR",
        f"IVA: {result.iva:.2f} EUR",
        f"Total: {result.total:.2f} EUR",
    ]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    """Execute CLI command."""

    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command != "cotizar":
        parser.print_help()
        return

    request = QuoteRequest(
        mueble=args.mueble,
        horas_mano_obra=args.horas,
        nivel_tela=args.tela,
        urgente=args.urgente,
        recogida=args.recogida,
    )
    try:
        result = estimate_quote(request)
    except ValueError as exc:
        parser.error(str(exc))
        return

    print(format_quote(request, result))


if __name__ == "__main__":
    main()
