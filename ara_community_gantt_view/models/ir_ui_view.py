from odoo import fields, models


class View(models.Model):
    _inherit = "ir.ui.view"

    type = fields.Selection(
        selection_add=[("community_gantt", "Gantt")],
        ondelete={"community_gantt": "cascade"},
    )

    def _get_view_info(self):
        return {
            "community_gantt": {
                "icon": "fa fa-tasks",
                "multiRecord": True,
            }
        } | super()._get_view_info()


class ActWindowView(models.Model):
    _inherit = "ir.actions.act_window.view"

    view_mode = fields.Selection(
        selection_add=[("community_gantt", "Gantt")],
        ondelete={"community_gantt": "cascade"},
    )
