import { Module } from '@nestjs/common';
import { DeterministicFilterService } from './deterministic-filter.service';
import { VehicleStatusService } from './vehicle-status.service';

/**
 * Lógica de dominio OBD-II, independiente de los casos de uso.
 *
 * Alberga el filtro determinístico, el diccionario de códigos y el recálculo
 * del estado del vehículo. Lo consumen tanto `ScansModule` como
 * `WorkOrdersModule`; mantenerlo dentro de uno de los dos producía una
 * dependencia circular entre ambos.
 */
@Module({
  providers: [DeterministicFilterService, VehicleStatusService],
  exports: [DeterministicFilterService, VehicleStatusService],
})
export class ObdModule {}
