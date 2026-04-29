import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks, flush } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { of, throwError, Subject, delay } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';

import { ChatWindowComponent } from './chat-window.component';
import { ChatService } from '../../services/chat.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ChatService stub */
function buildChatServiceStub(messageTrigger$: Subject<string> = new Subject()) {
  return {
    messageTrigger$: messageTrigger$.asObservable(),
    sendMessage: jasmine.createSpy('sendMessage').and.returnValue(of({ response: 'Mock AI reply' })),
    getUpcomingElections: jasmine.createSpy('getUpcomingElections').and.returnValue(of([])),
    triggerMessage: jasmine.createSpy('triggerMessage')
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ChatWindowComponent', () => {
  let component: ChatWindowComponent;
  let fixture: ComponentFixture<ChatWindowComponent>;
  let chatServiceStub: ReturnType<typeof buildChatServiceStub>;
  let messageTrigger$: Subject<string>;

  beforeEach(async () => {
    messageTrigger$ = new Subject<string>();
    chatServiceStub = buildChatServiceStub(messageTrigger$);

    await TestBed.configureTestingModule({
      imports: [ChatWindowComponent, CommonModule, FormsModule],
      providers: [
        { provide: ChatService, useValue: chatServiceStub },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatWindowComponent);
    component = fixture.componentInstance;
    
    // Reset state to ensure test isolation
    component.audioLoadingIndex = null;
    component.audioPlayingIndex = null;
    component.messages = [];
    
    fixture.detectChanges();
  });

  // ── Initialization ───────────────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should start with an empty messages array', () => {
      expect(component.messages).toEqual([]);
    });

    it('should start with isLoading false', () => {
      expect(component.isLoading).toBeFalse();
    });

    it('should start with no quick replies', () => {
      expect(component.currentQuickReplies).toEqual([]);
    });

    it('should subscribe to messageTrigger$ on init and call sendMessage', fakeAsync(() => {
      spyOn(component, 'sendMessage').and.stub(); // stub to prevent side-effects (timers)
      component.ngOnInit();
      messageTrigger$.next('election question');
      expect(component.sendMessage).toHaveBeenCalledWith('election question');
    }));
  });

  // ── sendMessage() ────────────────────────────────────────────────────────────

  describe('sendMessage()', () => {
    it('should add user message to messages array', () => {
      component.userInput = 'Who can vote?';
      component.sendMessage();
      expect(component.messages[0]).toEqual({
        role: 'user',
        parts: [{ text: 'Who can vote?' }]
      });
    });

    it('should call chatService.sendMessage with the correct arguments', () => {
      component.userInput = 'Test question';
      component.sendMessage();
      expect(chatServiceStub.sendMessage).toHaveBeenCalled();
    });

    it('should clear userInput after sending', () => {
      component.userInput = 'Some text';
      component.sendMessage();
      expect(component.userInput).toBe('');
    });

    it('should set isLoading to true while waiting and false after response', fakeAsync(() => {
      // Use a Subject so we can inspect in-flight state before the response arrives
      const responseSubject = new Subject<{ response: string }>();
      chatServiceStub.sendMessage.and.returnValue(responseSubject.asObservable());

      component.userInput = 'Test';
      component.sendMessage();
      // isLoading should be true immediately after sending (before response)
      expect(component.isLoading).toBeTrue();

      // Now complete the request
      responseSubject.next({ response: 'Done' });
      responseSubject.complete();
      tick(200); // flush scrollToBottom setTimeout
      expect(component.isLoading).toBeFalse();
    }));

    it('should add AI response to messages on success', fakeAsync(() => {
      component.userInput = 'Tell me something';
      component.sendMessage();
      tick(200);
      const lastMsg = component.messages[component.messages.length - 1];
      expect(lastMsg.role).toBe('model');
    }));

    it('should NOT send if input is only whitespace (edge case)', () => {
      component.userInput = '   ';
      component.sendMessage();
      expect(chatServiceStub.sendMessage).not.toHaveBeenCalled();
    });

    it('should NOT send if already loading (edge case)', () => {
      component.isLoading = true;
      component.userInput = 'Another question';
      component.sendMessage();
      expect(chatServiceStub.sendMessage).not.toHaveBeenCalled();
    });

    it('should add an error message and reset isLoading when API call fails', fakeAsync(() => {
      chatServiceStub.sendMessage.and.returnValue(throwError(() => new Error('Network error')));
      spyOn(console, 'error');
      component.userInput = 'Test error';
      component.sendMessage();
      tick(200);

      expect(component.isLoading).toBeFalse();
      expect(console.error).toHaveBeenCalled();
      const lastMsg = component.messages[component.messages.length - 1];
      expect(lastMsg.role).toBe('model');
      expect(lastMsg.parts[0].text).toContain("trouble connecting");
    }));

    it('should use the text argument instead of userInput when provided', fakeAsync(() => {
      component.userInput = 'should be ignored';
      component.sendMessage('Triggered from dashboard');
      tick(200);
      expect(component.messages[0].parts[0].text).toBe('Triggered from dashboard');
    }));
  });

  // ── extractQuickReplies() ────────────────────────────────────────────────────

  describe('extractQuickReplies()', () => {
    // Access the private method via type cast for unit testing
    function extract(text: string) {
      return (component as any).extractQuickReplies(text);
    }

    it('should return cleanText and empty quickReplies for plain text', () => {
      const result = extract('This is a plain answer.');
      expect(result.cleanText).toBe('This is a plain answer.');
      expect(result.quickReplies).toEqual([]);
    });

    it('should parse quick replies after ### 4. Quick Follow-ups marker', () => {
      const text = `Some answer here.
### 4. Quick Follow-ups
* What is EVM?
* Who is eligible?
* How to register?
* What is NOTA?`;

      const result = extract(text);
      expect(result.cleanText.trim()).toBe('Some answer here.');
      expect(result.quickReplies.length).toBe(4);
      expect(result.quickReplies[0]).toBe('What is EVM?');
    });

    it('should handle bullet points with dash (-) format', () => {
      const text = `Main answer.
### 4. Quick Follow-ups
- Question one
- Question two
- Question three
- Question four`;

      const result = extract(text);
      expect(result.quickReplies.length).toBe(4);
      expect(result.quickReplies[0]).toBe('Question one');
    });

    it('should handle bullet points with bullet (•) format', () => {
      const text = `Answer.
### 4. Quick Follow-ups
• First?
• Second?
• Third?
• Fourth?`;

      const result = extract(text);
      expect(result.quickReplies.length).toBe(4);
    });

    it('should extract last 4 bullets from long response without the marker (fallback)', () => {
      const text = `Preamble info.
* Bullet A
* Bullet B
* Bullet C
* Bullet D
* Bullet E
* Bullet F`;

      const result = extract(text);
      // Should take the last 4 bullets as quick replies
      expect(result.quickReplies.length).toBe(4);
      expect(result.quickReplies[0]).toBe('Bullet C');
    });

    it('should not extract quick replies if fewer than 4 bullets in fallback path', () => {
      const text = `Short answer.
* Only one bullet`;

      const result = extract(text);
      expect(result.quickReplies).toEqual([]);
      expect(result.cleanText).toBe(text);
    });

    it('should return empty quickReplies for a response with no marker and no bullets', () => {
      const text = 'Pure prose response with no lists at all.';
      const result = extract(text);
      expect(result.quickReplies).toEqual([]);
      expect(result.cleanText).toBe(text);
    });
  });

  // ── playHindiAudio() state management ───────────────────────────────────────

  describe('playHindiAudio()', () => {
    let fetchSpy: jasmine.Spy;
    let mockAudio: jasmine.SpyObj<HTMLAudioElement>;

    beforeEach(() => {
      // 1. Create a stable mock that exists BEFORE the test starts
      mockAudio = jasmine.createSpyObj('HTMLAudioElement', ['pause', 'play']);
      mockAudio.play.and.returnValue(Promise.resolve());

      // 2. Override the global Audio constructor to always return this stable mock
      spyOn(window as any, 'Audio').and.returnValue(mockAudio);

      // 3. Spy on global fetch and console
      fetchSpy = spyOn(window, 'fetch');
      spyOn(console, 'error');

      // 4. Ensure the component state is clean
      component.audioLoadingIndex = null;
      component.audioPlayingIndex = null;
      component.currentAudio = null;
    });

    afterEach(() => {
      // 5. CRITICAL: Clear event listeners to prevent them from firing in the next test
      mockAudio.oncanplaythrough = null as any;
      mockAudio.onended = null as any;
      mockAudio.onerror = null as any;
    });

    it('should set audioLoadingIndex while fetching', async () => {
      // Never resolve fetch so we can inspect intermediate state
      fetchSpy.and.returnValue(new Promise(() => {}));

      component.playHindiAudio('Test text', 2);
      expect(component.audioLoadingIndex).toBe(2);
    });

    it('should reset audioLoadingIndex to null after a successful fetch', async () => {
      fetchSpy.and.returnValue(Promise.resolve({
        json: () => Promise.resolve({ audio: btoa('fake-audio-data'), translatedText: 'Hindi text' })
      } as Response));

      await component.playHindiAudio('Test', 0);
      expect(component.audioLoadingIndex).toBeNull();
    });

    it('should reset audioLoadingIndex to null even after a failed fetch (edge case)', async () => {
      fetchSpy.and.returnValue(Promise.reject(new Error('Network error')));

      await component.playHindiAudio('Test', 1);
      expect(component.audioLoadingIndex).toBeNull();
    });

    it('should not start a new request if audioLoadingIndex is already set (edge case)', async () => {
      component.audioLoadingIndex = 3; // simulate already loading
      await component.playHindiAudio('Another request', 5);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should pause and toggle off audio if the same index is clicked while playing', async () => {
      const existingAudio = jasmine.createSpyObj('HTMLAudioElement', ['pause', 'play']);
      component.currentAudio = existingAudio;
      component.audioPlayingIndex = 1;

      await component.playHindiAudio('Some text', 1);

      expect(existingAudio.pause).toHaveBeenCalled();
      expect(component.audioPlayingIndex).toBeNull();
      // fetch should NOT have been called for a toggle-off
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should stop previous audio before playing new audio at a different index', async () => {
      const prevAudio = jasmine.createSpyObj('HTMLAudioElement', ['pause', 'play']);
      component.currentAudio = prevAudio;
      component.audioPlayingIndex = 0;

      fetchSpy.and.returnValue(Promise.resolve({
        json: () => Promise.resolve({ audio: btoa('new-audio') })
      } as Response));

      await component.playHindiAudio('New text', 1);

      expect(prevAudio.pause).toHaveBeenCalled();
    });

    it('should handle the full audio playback lifecycle (success, ending, and error)', fakeAsync(() => {
      // 1. SUCCESS PATH
      fetchSpy.and.returnValue(Promise.resolve({
        json: () => Promise.resolve({ audio: btoa('audio-data') })
      } as Response));

      component.playHindiAudio('Success Text', 1);
      tick(); // Resolve fetch
      
      if (mockAudio.oncanplaythrough) mockAudio.oncanplaythrough(new Event('canplaythrough'));
      tick();
      expect(component.audioPlayingIndex).toBe(1);
      expect(component.audioLoadingIndex).toBeNull();

      // 2. ENDING PATH
      if (mockAudio.onended) mockAudio.onended(new Event('ended'));
      tick();
      expect(component.audioPlayingIndex).toBeNull();

      // 3. ERROR PATH
      component.playHindiAudio('Error Text', 2);
      tick();
      if (mockAudio.onerror) mockAudio.onerror(new Event('error') as any);
      tick();
      expect(component.audioPlayingIndex).toBeNull();
      expect(component.audioLoadingIndex).toBeNull();
      expect(console.error).toHaveBeenCalled();
    }));
  });

  describe('Formatting & Scrolling', () => {
    it('should format message using markdown', () => {
      const raw = '**Bold**';
      const formatted = component.formatMessage(raw);
      expect(formatted.toString()).toContain('<strong>Bold</strong>');
    });

    it('should scroll to bottom', (done) => {
      const mockElement = { scrollTop: 0, scrollHeight: 1000 };
      component['scrollContainer'] = { nativeElement: mockElement } as any;
      
      component['scrollToBottom']();
      
      setTimeout(() => {
        expect(mockElement.scrollTop).toBe(1000);
        done();
      }, 0);
    });

    it('should trigger scrollToBottom after sendMessage', fakeAsync(() => {
      chatServiceStub.sendMessage.and.returnValue(of({ response: 'ok' }));
      spyOn(component as any, 'scrollToBottom');
      
      component.sendMessage('Hello');
      tick(100);
      
      expect(component['scrollToBottom']).toHaveBeenCalled();
    }));
  });

  describe('Edge Cases', () => {
    it('should use userInput if no text is provided to sendMessage', () => {
      chatServiceStub.sendMessage.and.returnValue(of({ response: 'ok' }));
      component.userInput = 'Hello';
      
      component.sendMessage();
      
      expect(component.messages[0].parts[0].text).toBe('Hello');
    });

    it('should handle API errors in sendMessage', () => {
      // Mock the error response
      chatServiceStub.sendMessage.and.returnValue(throwError(() => new Error('API Error')));
      
      // Spy on console.error to prevent it from failing the test
      const consoleSpy = spyOn(console, 'error');
      
      component.userInput = 'Error Test';
      component.sendMessage();
      
      expect(component.isLoading).toBeFalse();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
