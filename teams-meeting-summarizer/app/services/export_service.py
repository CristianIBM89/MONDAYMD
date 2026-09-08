"""
Exportación local de resúmenes.
Genera archivos JSON y CSV descargables desde el dashboard.
"""
import csv
import json
import io
from datetime import datetime


def summary_to_json(meeting: dict) -> str:
    """Serializa el resumen completo de una reunión a JSON legible."""
    return json.dumps(meeting, ensure_ascii=False, indent=2)


def summary_to_csv(meeting: dict) -> str:
    """
    Convierte los action items de una reunión a CSV descargable.
    Formato: tarea, responsable, fecha_limite, reunion, fecha_reunion
    """
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Tarea", "Responsable", "Fecha Límite", "Reunión", "Fecha Reunión"])

    action_items = meeting.get("action_items", [])
    subject = meeting.get("subject", "")
    start_time = meeting.get("start_time", "")

    for item in action_items:
        writer.writerow([
            item.get("tarea", ""),
            item.get("responsable", ""),
            item.get("fecha_limite", ""),
            subject,
            start_time,
        ])

    return output.getvalue()


def all_action_items_to_csv(meetings: list[dict]) -> str:
    """Exporta los action items de TODAS las reuniones en un solo CSV."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Tarea", "Responsable", "Fecha Límite", "Reunión", "Fecha Reunión"])

    for m in meetings:
        for item in m.get("action_items", []):
            writer.writerow([
                item.get("tarea", ""),
                item.get("responsable", ""),
                item.get("fecha_limite", ""),
                m.get("subject", ""),
                m.get("start_time", ""),
            ])

    return output.getvalue()
