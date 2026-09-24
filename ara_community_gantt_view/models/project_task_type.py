from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ProjectTaskType(models.Model):
    _inherit = "project.task.type"

    stage_progress = fields.Integer(
        string="Gantt Progress (%)",
        default=0,
        help="Progress assigned to tasks in this stage for the Gantt view.",
    )

    @api.constrains("stage_progress")
    def _check_stage_progress(self):
        for stage in self:
            if not 0 <= stage.stage_progress <= 100:
                raise ValidationError(
                    _("Gantt Progress must be between 0 and 100."))
