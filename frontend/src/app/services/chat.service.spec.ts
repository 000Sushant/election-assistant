import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService, ChatMessage, UpcomingElection } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ChatService]
    });
    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify(); // ensures no outstanding HTTP requests
  });

  // ── Instantiation ──────────────────────────────────────────────
  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getUpcomingElections() ─────────────────────────────────────
  describe('getUpcomingElections()', () => {
    it('should make a GET request to /api/upcoming-elections', () => {
      const mockElections: UpcomingElection[] = [
        { state: 'Bihar', date: 'Oct 2025' },
        { state: 'Delhi', date: 'Feb 2026' }
      ];

      service.getUpcomingElections().subscribe(elections => {
        expect(elections).toEqual(mockElections);
        expect(elections.length).toBe(2);
      });

      const req = httpMock.expectOne('/api/upcoming-elections');
      expect(req.request.method).toBe('GET');
      req.flush(mockElections);
    });

    it('should return an empty array when the API returns []', () => {
      service.getUpcomingElections().subscribe(elections => {
        expect(elections).toEqual([]);
      });

      const req = httpMock.expectOne('/api/upcoming-elections');
      req.flush([]);
    });

    it('should propagate HTTP errors to the subscriber', () => {
      service.getUpcomingElections().subscribe({
        next: () => fail('expected an error'),
        error: (err) => {
          expect(err.status).toBe(500);
        }
      });

      const req = httpMock.expectOne('/api/upcoming-elections');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    });
  });

  // ── sendMessage() ──────────────────────────────────────────────
  describe('sendMessage()', () => {
    it('should make a POST request to /api/chat with message and history', () => {
      const message = 'Who can vote in India?';
      const history: ChatMessage[] = [];
      const mockResponse = { response: 'All citizens aged 18+' };

      service.sendMessage(message, history).subscribe(res => {
        expect(res.response).toBe('All citizens aged 18+');
      });

      const req = httpMock.expectOne('/api/chat');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ message, history });
      req.flush(mockResponse);
    });

    it('should send conversation history in the request body', () => {
      const history: ChatMessage[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi!' }] }
      ];

      service.sendMessage('Next question', history).subscribe();

      const req = httpMock.expectOne('/api/chat');
      expect(req.request.body.history).toEqual(history);
      req.flush({ response: 'Mocked' });
    });

    it('should work with an empty history array (edge case)', () => {
      service.sendMessage('Test', []).subscribe(res => {
        expect(res).toBeDefined();
      });

      const req = httpMock.expectOne('/api/chat');
      expect(req.request.body.history).toEqual([]);
      req.flush({ response: 'OK' });
    });

    it('should propagate HTTP errors to the subscriber', () => {
      service.sendMessage('Test', []).subscribe({
        next: () => fail('expected an error'),
        error: (err) => {
          expect(err.status).toBe(500);
        }
      });

      const req = httpMock.expectOne('/api/chat');
      req.flush('Internal error', { status: 500, statusText: 'Internal Server Error' });
    });
  });

  // ── messageTrigger$ observable ─────────────────────────────────
  describe('messageTrigger$', () => {
    it('should emit a value when triggerMessage() is called', (done) => {
      const testMessage = 'Tell me about voting rights';

      service.messageTrigger$.subscribe(msg => {
        expect(msg).toBe(testMessage);
        done();
      });

      service.triggerMessage(testMessage);
    });

    it('should emit multiple values in sequence', () => {
      const received: string[] = [];
      const messages = ['first', 'second', 'third'];

      service.messageTrigger$.subscribe(msg => received.push(msg));

      messages.forEach(m => service.triggerMessage(m));

      expect(received).toEqual(messages);
    });

    it('should not emit to subscribers who joined after triggerMessage() (Subject, not BehaviorSubject)', () => {
      // Trigger before subscribing
      service.triggerMessage('early message');

      const received: string[] = [];
      service.messageTrigger$.subscribe(msg => received.push(msg));

      // The late subscriber should not have received the early message
      expect(received.length).toBe(0);
    });
  });
});