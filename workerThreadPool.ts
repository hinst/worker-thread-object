import worker_threads from 'worker_threads';

class IncomingMessage<INPUT> {
    input: INPUT;
    taskId: number;

    constructor(input: INPUT, taskId: number) {
        this.input = input;
        this.taskId = taskId;
    }
}

class ReturningMessage<OUTPUT> {
    output: OUTPUT;
    taskId: number;

    constructor(output: OUTPUT, taskId: number) {
        this.output = output;
        this.taskId = taskId;
    }
}

enum WorkerThreadStatus {
    waiting = 0,
    running = 1,
    finished = 2
}

class WorkerThreadRecord<OUTPUT> {
    workerThread: worker_threads.Worker;
    status: WorkerThreadStatus;
    output: OUTPUT;
}

export class WorkerThreadMessenger<INPUT, OUTPUT> {
    receive(workerFunction: (input: INPUT) => Promise<OUTPUT>) {
        if (!worker_threads.isMainThread) {
            worker_threads.parentPort.on('message', async(message: IncomingMessage<INPUT>) => {
                const output = await workerFunction(message.input);
                worker_threads.parentPort.postMessage(
                    new ReturningMessage<OUTPUT>(output, message.taskId)
                );
            });
        }
    }
}

export class WorkerThreadPool<INPUT, OUTPUT> {
    workers: WorkerThreadRecord<OUTPUT>[];

    constructor(fileName: string, size: number) {
        this.workers = new Array(size).fill(null).map(v => {
            const record = new WorkerThreadRecord<OUTPUT>();
            record.workerThread = new worker_threads.Worker(fileName);
            record.status = WorkerThreadStatus.waiting;
            record.workerThread.on('message', (message: ReturningMessage<OUTPUT>) => {
                record.output = message.output;
                record.status = WorkerThreadStatus.finished;
            });
            return record;
        });
    }

    async submit(input: INPUT): Promise<OUTPUT> {
        let workerIndex = await this.waitAvailableWorkerIndex();
        const workerRecord = this.workers[workerIndex];
        workerRecord.status = WorkerThreadStatus.running;
        delete workerRecord.output;
        workerRecord.workerThread.postMessage(new IncomingMessage(input, workerIndex));
        while (true) {
            if (this.workers[workerIndex].status == WorkerThreadStatus.finished) {
                return
            }
            await sleep(1);
        }
    }

    private findAvailableWorkerIndex(): number {
        for (let i = 0; i < this.workers.length; i++) {
            if (this.workers[i].status == WorkerThreadStatus.waiting)
                return i;
        }
        return null;
    }

    private async waitAvailableWorkerIndex(): Promise<number> {
        while (true) {
            const index = this.findAvailableWorkerIndex();
            if (index != null)
                return index;
            await sleep(1);
        }
    }
}

function sleep(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}