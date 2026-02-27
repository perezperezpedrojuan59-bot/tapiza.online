import unittest
from contextlib import redirect_stdout
from io import StringIO

from job.main import main
from job.quote import QuoteRequest, estimate_quote


class QuoteDomainTests(unittest.TestCase):
    def test_estimate_quote_standard(self) -> None:
        request = QuoteRequest(
            mueble="sofa_3p",
            horas_mano_obra=14,
            nivel_tela="premium",
        )
        result = estimate_quote(request)

        self.assertEqual(result.base_mueble, 240.0)
        self.assertEqual(result.costo_mano_obra, 336.0)
        self.assertEqual(result.recargo_urgencia, 0.0)
        self.assertEqual(result.costo_recogida, 0.0)
        self.assertAlmostEqual(result.subtotal, 892.8, places=2)
        self.assertAlmostEqual(result.iva, 187.49, places=2)
        self.assertAlmostEqual(result.total, 1080.29, places=2)

    def test_estimate_quote_with_urgency_and_pickup(self) -> None:
        request = QuoteRequest(
            mueble="silla",
            horas_mano_obra=3,
            nivel_tela="estandar",
            urgente=True,
            recogida=True,
        )
        result = estimate_quote(request)

        self.assertGreater(result.recargo_urgencia, 0.0)
        self.assertEqual(result.costo_recogida, 35.0)
        self.assertGreater(result.total, result.subtotal)

    def test_estimate_quote_rejects_invalid_furniture(self) -> None:
        request = QuoteRequest(
            mueble="mesa",
            horas_mano_obra=5,
            nivel_tela="estandar",
        )
        with self.assertRaises(ValueError):
            estimate_quote(request)

    def test_estimate_quote_rejects_non_positive_hours(self) -> None:
        request = QuoteRequest(
            mueble="sillon",
            horas_mano_obra=0,
            nivel_tela="economica",
        )
        with self.assertRaises(ValueError):
            estimate_quote(request)


class QuoteCliTests(unittest.TestCase):
    def test_cli_cotizar_command_outputs_summary(self) -> None:
        buffer = StringIO()
        with redirect_stdout(buffer):
            main(
                [
                    "cotizar",
                    "--mueble",
                    "sillon",
                    "--horas",
                    "8",
                    "--tela",
                    "estandar",
                ]
            )
        output = buffer.getvalue()

        self.assertIn("=== Cotizacion tapiza.online ===", output)
        self.assertIn("Mueble: sillon", output)
        self.assertIn("Total:", output)


if __name__ == "__main__":
    unittest.main()
